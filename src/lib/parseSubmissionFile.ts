// Worker must be imported before PDFParse to avoid "Setting up fake worker failed" error
// in Next.js / serverless environments. See pdf-parse troubleshooting docs.
import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import { getStorageBucket } from "@/lib/firebase-admin";
import { createServiceRoleClient } from "@/lib/supabase-server";

const TEXT_MIMES = new Set([
  "text/plain",
  "text/x-python",
  "application/x-python-code",
  "text/x-python-script",
]);

/**
 * Download a file from GCS, convert it to Markdown, store the result back in
 * GCS, and update the submission_files row. Mirrors the Python
 * parse_submission_file Cloud Function that this replaces.
 */
export async function parseSubmissionFile(fileId: string): Promise<void> {
  const supabase = createServiceRoleClient();

  const { data: record, error } = await supabase
    .from("submission_files")
    .select(
      "id, storage_path, filename, mime_type, assignment_id, submission_id, processing_status",
    )
    .eq("id", fileId)
    .single();

  if (error || !record) {
    throw new Error(`File record not found: ${fileId}`);
  }

  if (
    record.processing_status === "processed" ||
    record.processing_status === "processing"
  ) {
    return;
  }

  const mime = (record.mime_type ?? "").toLowerCase();
  const nameLower = (record.filename ?? "").toLowerCase();

  const isPdf = mime === "application/pdf" || nameLower.endsWith(".pdf");
  const isText =
    TEXT_MIMES.has(mime) ||
    nameLower.endsWith(".txt") ||
    nameLower.endsWith(".py") ||
    nameLower.endsWith(".rmd");

  if (!isPdf && !isText) {
    await supabase
      .from("submission_files")
      .update({ processing_status: "failed" })
      .eq("id", fileId);
    return;
  }

  await supabase
    .from("submission_files")
    .update({ processing_status: "processing" })
    .eq("id", fileId);

  try {
    const bucket = getStorageBucket();
    const [fileBuffer] = await bucket.file(record.storage_path).download();

    let mdText: string;
    if (isPdf) {
      const parser = new PDFParse({ data: new Uint8Array(fileBuffer) });
      const result = await parser.getText();
      await parser.destroy();
      mdText = result.text;
    } else {
      const text = fileBuffer.toString("utf-8");
      mdText = nameLower.endsWith(".py") ? `\`\`\`python\n${text}\n\`\`\`` : text;
    }

    const parsedPath = `parsed-content/${record.assignment_id}/${record.submission_id}/${fileId}.md`;
    await bucket.file(parsedPath).save(mdText, { contentType: "text/markdown" });

    const parsedUrl = `https://storage.googleapis.com/${bucket.name}/${parsedPath}`;

    await supabase
      .from("submission_files")
      .update({ processing_status: "processed", parsed_content_url: parsedUrl })
      .eq("id", fileId);
  } catch (err) {
    await supabase
      .from("submission_files")
      .update({ processing_status: "failed" })
      .eq("id", fileId);
    throw err;
  }
}
