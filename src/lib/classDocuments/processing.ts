import "server-only";
import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import { createSign, randomUUID } from "node:crypto";
import { getStorageBucket } from "@/lib/firebase-admin";
import { createServiceRoleClient } from "@/lib/supabase-server";
import { suggestFigureLabels, type FigureLabelSource } from "@/lib/classDocuments/figureLabels";
import { buildDocumentIndex, writeDocumentArtifact } from "@/lib/classDocuments/artifacts";

type Block = {
  pageSpan?: { pageStart?: number };
  textBlock?: { text?: string; type?: string; blocks?: Block[] };
  tableBlock?: { headerRows?: Row[]; bodyRows?: Row[]; caption?: string };
  listBlock?: { type?: string; listEntries?: { blocks?: Block[] }[] };
  imageBlock?: { mimeType?: string; imageText?: string; annotations?: { description?: string }; blobAssetId?: string; dataUri?: string; gcsUri?: string };
};
type Row = { cells?: { blocks?: Block[] }[] };
type ParsedDocument = {
  text?: string;
  pages?: unknown[];
  shardInfo?: { shardIndex?: number };
  documentLayout?: { blocks?: Block[] };
  blobAssets?: { assetId: string; content: string; mimeType: string }[];
};

function config() {
  const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "", "base64").toString("utf8")) as { client_email: string; private_key: string; project_id: string };
  const location = process.env.DOCUMENT_AI_LOCATION || "us";
  const processor = process.env.DOCUMENT_AI_PROCESSOR_ID;
  if (!processor || !/^[a-z0-9-]+$/.test(location) || !/^[a-zA-Z0-9]+$/.test(processor)) {
    throw new Error("Document AI processor is not configured");
  }
  const version = process.env.DOCUMENT_AI_PROCESSOR_VERSION || "pretrained-layout-parser-v1.5-2025-08-25";
  return { serviceAccount, location, processor, version };
}

async function googleToken(): Promise<string> {
  const { serviceAccount } = config();
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const assertion = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: serviceAccount.client_email, scope: "https://www.googleapis.com/auth/cloud-platform", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const signer = createSign("RSA-SHA256");
  signer.update(assertion);
  const signed = `${assertion}.${signer.sign(serviceAccount.private_key, "base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signed }),
  });
  if (!response.ok) throw new Error("Google authentication failed");
  return (await response.json()).access_token as string;
}

async function googleRequest(path: string, init?: RequestInit) {
  const { location } = config();
  const response = await fetch(`https://${location}-documentai.googleapis.com/v1/${path}`, {
    ...init, headers: { Authorization: `Bearer ${await googleToken()}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message || "Document AI request failed");
  return json;
}

export async function startDocumentProcessing(documentId: string) {
  const db = createServiceRoleClient();
  const { data: record, error } = await db.from("class_documents").select("id, original_path, file_size, status").eq("id", documentId).single();
  if (error || !record || !["uploading", "failed"].includes(record.status)) throw new Error("Document cannot be processed");
  const bucket = getStorageBucket();
  const file = bucket.file(record.original_path);
  const [metadata] = await file.getMetadata();
  if (Number(metadata.size) !== record.file_size || Number(metadata.size) > 20 * 1024 * 1024) throw new Error("Uploaded file size does not match");
  const [bytes] = await file.download();
  if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("File is not a PDF");
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  let pages: number;
  try { pages = (await parser.getInfo()).total; } finally { await parser.destroy(); }
  if (pages < 1 || pages > 100) throw new Error("PDF must contain 1 to 100 pages");
  const { serviceAccount, location, processor, version } = config();
  const outputPrefix = `class-documents/${documentId}/document-ai/`;
  const operation = await googleRequest(`projects/${serviceAccount.project_id}/locations/${location}/processors/${processor}/processorVersions/${version}:batchProcess`, {
    method: "POST",
    body: JSON.stringify({
      inputDocuments: { gcsDocuments: { documents: [{ gcsUri: `gs://${bucket.name}/${record.original_path}`, mimeType: "application/pdf" }] } },
      documentOutputConfig: { gcsOutputConfig: { gcsUri: `gs://${bucket.name}/${outputPrefix}` } },
      processOptions: { layoutConfig: { enableImageAnnotation: true, enableTableAnnotation: true, chunkingConfig: { chunkSize: 1000, includeAncestorHeadings: true } } },
    }),
  });
  if (!operation.name) throw new Error("Document AI did not return an operation");
  const { error: updateError } = await db.from("class_documents").update({ status: "processing", operation_name: operation.name, page_count: pages, error_message: null }).eq("id", documentId);
  if (updateError) throw updateError;
}

function flatten(blocks: Block[]): string {
  return blocks.map((block) => {
    if (block.textBlock) return block.textBlock.text || flatten(block.textBlock.blocks || []);
    if (block.listBlock) return (block.listBlock.listEntries || []).map((entry) => flatten(entry.blocks || [])).join("; ");
    return "";
  }).filter(Boolean).join(" ").trim();
}

function tableMarkdown(rows: Row[]): string {
  const values = rows.map((row) => (row.cells || []).map((cell) => flatten(cell.blocks || []).replace(/\|/g, "\\|").replace(/\s+/g, " ")));
  if (!values.length) return "";
  return [
    `| ${values[0].join(" | ")} |`,
    `| ${values[0].map(() => "---").join(" | ")} |`,
    ...values.slice(1).map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function imageBytes(image: NonNullable<Block["imageBlock"]>, doc: ParsedDocument): { bytes: Buffer; mime: string } | null {
  if (image.blobAssetId) {
    const asset = doc.blobAssets?.find((item) => item.assetId === image.blobAssetId);
    if (asset) return { bytes: Buffer.from(asset.content, "base64"), mime: asset.mimeType };
  }
  if (image.dataUri) {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([\s\S]*)$/.exec(image.dataUri);
    if (match) return { bytes: Buffer.from(match[2], "base64"), mime: match[1] };
  }
  return null;
}

export async function finishDocumentProcessing(documentId: string) {
  const db = createServiceRoleClient();
  const { data: record } = await db.from("class_documents").select("id, status, operation_name").eq("id", documentId).single();
  if (!record || record.status !== "processing" || !record.operation_name) return;
  try {
    const operation = await googleRequest(record.operation_name);
    if (!operation.done) return;
    if (operation.error) throw new Error(operation.error.message || "Document AI failed");
    const bucket = getStorageBucket();
    const [files] = await bucket.getFiles({ prefix: `class-documents/${documentId}/document-ai/` });
    const jsonFiles = files.filter((file) => file.name.endsWith(".json"));
    if (!jsonFiles.length) throw new Error("Document AI returned no parsed document");
    const documents = await Promise.all(jsonFiles.map(async (file) => {
      const [raw] = await file.download();
      return JSON.parse(raw.toString("utf8")) as ParsedDocument;
    }));
    documents.sort((a, b) => (a.shardInfo?.shardIndex ?? 0) - (b.shardInfo?.shardIndex ?? 0));
    if (documents.every((doc) => !doc.documentLayout?.blocks?.length)) throw new Error("Document AI returned no layout blocks");
    const chunks: { document_id: string; chunk_order: number; page_number: number; heading: string | null; content: string }[] = [];
    const figures: { id: string; page_number: number; figure_order: number; storage_path: string; description: string; selected: boolean; source_labels: string[]; label_source: FigureLabelSource }[] = [];
    const markdown: string[] = [];
    let page = 0;
    let heading: string | null = null;
    async function visit(block: Block, doc: ParsedDocument) {
      const nextPage = block.pageSpan?.pageStart ?? (page || 1);
      if (nextPage !== page) { page = nextPage; markdown.push(`\n<!-- Page ${page} -->\n`); }
      let line = "";
      if (block.textBlock) {
        const type = block.textBlock.type || "";
        if (type === "header" || type === "footer") return;
        const text = block.textBlock.text?.trim();
        if (text) {
          const level = /^heading-([1-5])$/.exec(type);
          line = level ? `${"#".repeat(Number(level[1]))} ${text}` : text;
          if (level) heading = text;
        }
      } else if (block.tableBlock) {
        line = [block.tableBlock.caption, tableMarkdown([...(block.tableBlock.headerRows || []), ...(block.tableBlock.bodyRows || [])])].filter(Boolean).join("\n\n");
      } else if (block.listBlock) {
        line = (block.listBlock.listEntries || []).map((entry, index) => `${block.listBlock?.type === "ordered" ? `${index + 1}.` : "-"} ${flatten(entry.blocks || [])}`).join("\n");
      } else if (block.imageBlock) {
        const image = block.imageBlock;
        const description = (image.annotations?.description || image.imageText || "Figure").trim();
        let data = imageBytes(image, doc);
        if (!data && image.gcsUri) {
          const match = /^gs:\/\/([^/]+)\/(.+)$/.exec(image.gcsUri);
          if (match && match[1] === bucket.name) {
            const [bytes] = await bucket.file(match[2]).download();
            data = { bytes, mime: image.mimeType || "image/png" };
          }
        }
        if (data && ["image/png", "image/jpeg", "image/webp"].includes(data.mime)) {
          const order = figures.length + 1;
          const ext = data.mime === "image/jpeg" ? "jpg" : data.mime.split("/")[1];
          const path = `class-documents/${documentId}/figures/${order}.${ext}`;
          await bucket.file(path).save(data.bytes, { contentType: data.mime, resumable: false });
          const selected = !/^(logo|icon|decoration|decorative|watermark)\b/i.test(description);
          figures.push({ id: randomUUID(), page_number: page, figure_order: order, storage_path: path, description, selected, source_labels: [], label_source: "unlabeled" });
          if (selected) line = `![${description.replace(/[\[\]\n]/g, " ")}](figures/${order}.${ext})`;
        } else if (description !== "Figure") line = `*Figure: ${description}*`;
      }
      if (line) { markdown.push(line); chunks.push({ document_id: documentId, chunk_order: chunks.length, page_number: page, heading, content: line }); }
      for (const child of block.textBlock?.blocks || []) await visit(child, doc);
    }
    for (const doc of documents) for (const block of doc.documentLayout?.blocks || []) await visit(block, doc);
    suggestFigureLabels(figures, chunks);
    const content = markdown.join("\n\n").trim();
    if (!content) throw new Error("Document AI returned empty text");
    const draftPath = await writeDocumentArtifact(documentId, { markdown: content, index: buildDocumentIndex(content, figures) }, "draft");
    const { error } = await db.from("class_documents").update({ draft_path: draftPath, status: "review", operation_name: null }).eq("id", documentId);
    if (error) throw error;
  } catch (error) {
    await db.from("class_documents").update({ status: "failed", error_message: error instanceof Error ? error.message : "Conversion failed", operation_name: null }).eq("id", documentId);
  }
}
