import { NextRequest, NextResponse } from "next/server";
import { documentAccess } from "@/lib/classDocuments/auth";
import {
  finishDocumentProcessing,
  startDocumentProcessing,
} from "@/lib/classDocuments/processing";
import { getStorageBucket } from "@/lib/firebase-admin";
import { createServiceRoleClient } from "@/lib/supabase-server";
import {
  includeFigureGroupLabels,
  normalizeFigureLabel,
} from "@/lib/classDocuments/figureLabels";
import {
  buildDocumentIndex,
  readDocumentArtifact,
  writeDocumentArtifact,
  type DocumentFigure,
} from "@/lib/classDocuments/artifacts";
import {
  synchronizeFigureText,
  validateFigureManifest,
} from "@/lib/classDocuments/validation";
import { documentQueueEnabled } from "@/lib/classDocuments/queue";

type Context = { params: Promise<{ documentId: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const { documentId } = await context.params;
  let access = await documentAccess(documentId);
  if (!access)
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  if (access.document.status === "processing" && !documentQueueEnabled()) {
    await finishDocumentProcessing(documentId);
    access = await documentAccess(documentId);
    if (!access)
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
  }
  const path = access.document.draft_path || access.document.approved_path;
  const artifact = path ? await readDocumentArtifact(path) : null;
  const figures = artifact?.index.figures || [];
  const {
    id,
    class_id,
    title,
    filename,
    file_size,
    page_count,
    tags,
    status,
    error_message,
    created_at,
    updated_at,
    processing_stage,
    processed_pages,
  } = access.document;
  const document = {
    id,
    class_id,
    title,
    filename,
    file_size,
    page_count,
    tags,
    status,
    error_message,
    created_at,
    updated_at,
    processing_stage,
    processed_pages,
    markdown: artifact?.markdown || "",
  };
  return NextResponse.json({
    document,
    figures,
    reviewWarnings: artifact?.index.review_warnings || [],
  });
}

export async function POST(request: NextRequest, context: Context) {
  const { documentId } = await context.params;
  const access = await documentAccess(documentId);
  if (!access)
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  const { action } = (await request.json()) as { action?: string };
  if (action !== "confirm" && action !== "retry")
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  if (action === "confirm" && access.document.status !== "uploading")
    return NextResponse.json({ error: "Already confirmed" }, { status: 409 });
  if (action === "retry" && access.document.status !== "failed")
    return NextResponse.json(
      { error: "Document is not failed" },
      { status: 409 },
    );
  try {
    await startDocumentProcessing(documentId);
    return NextResponse.json({ status: "processing" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Processing failed";
    await createServiceRoleClient()
      .from("class_documents")
      .update({ status: "failed", error_message: message })
      .eq("id", documentId);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  const { documentId } = await context.params;
  const access = await documentAccess(documentId);
  if (!access)
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  if (!["review", "ready"].includes(access.document.status))
    return NextResponse.json(
      { error: "Document is not ready for review" },
      { status: 409 },
    );
  const body = (await request.json()) as {
    title?: string;
    tags?: string[];
    markdown?: string;
    selectedFigureIds?: string[];
    figureLabels?: Record<string, string[]>;
    figureCaptions?: Record<string, string>;
    figureDescriptions?: Record<string, string>;
    ready?: boolean;
  };
  const title = body.title?.trim();
  if (
    !title ||
    title.length > 200 ||
    typeof body.markdown !== "string" ||
    !body.markdown.trim() ||
    body.markdown.length > 2_000_000 ||
    !Array.isArray(body.selectedFigureIds)
  ) {
    return NextResponse.json(
      { error: "Title, Markdown, and figure selection are required" },
      { status: 400 },
    );
  }
  const tags = body.tags || [];
  if (
    !Array.isArray(tags) ||
    tags.length > 20 ||
    tags.some(
      (tag) => typeof tag !== "string" || !tag.trim() || tag.length > 50,
    )
  )
    return NextResponse.json({ error: "Invalid tags" }, { status: 400 });
  const sourcePath =
    access.document.draft_path || access.document.approved_path;
  if (!sourcePath)
    return NextResponse.json(
      { error: "Document content is unavailable" },
      { status: 409 },
    );
  const sourceArtifact = await readDocumentArtifact(sourcePath);
  const figures = sourceArtifact.index.figures as DocumentFigure[];
  if (
    figures.some(
      (figure) =>
        !figure.storage_path.startsWith(
          `class-documents/${documentId}/figures/`,
        ),
    )
  ) {
    return NextResponse.json(
      { error: "Figure manifest contains an invalid storage path" },
      { status: 409 },
    );
  }
  const selected = new Set(body.selectedFigureIds);
  if (
    selected.size !== body.selectedFigureIds.length ||
    [...selected].some((id) => !figures.some((figure) => figure.id === id))
  )
    return NextResponse.json(
      { error: "Invalid figure selection" },
      { status: 400 },
    );
  const figureLabels = new Map<string, string[]>();
  if (body.figureLabels !== undefined) {
    if (
      !body.figureLabels ||
      typeof body.figureLabels !== "object" ||
      Array.isArray(body.figureLabels)
    )
      return NextResponse.json(
        { error: "Invalid figure labels" },
        { status: 400 },
      );
    for (const [id, values] of Object.entries(body.figureLabels)) {
      if (
        !figures.some((figure) => figure.id === id) ||
        !Array.isArray(values) ||
        values.length > 10
      )
        return NextResponse.json(
          { error: "Invalid figure labels" },
          { status: 400 },
        );
      const labels = values.map((value) =>
        typeof value === "string" ? normalizeFigureLabel(value) : null,
      );
      if (
        labels.some((label) => !label) ||
        new Set(labels).size !== labels.length
      )
        return NextResponse.json(
          { error: "Use unique labels such as Figure 50.3" },
          { status: 400 },
        );
      figureLabels.set(id, includeFigureGroupLabels(labels as string[]));
    }
  }
  let markdown = body.markdown;
  for (const figure of figures) {
    const basename = figure.storage_path.split("/").pop();
    if (!selected.has(figure.id) && basename)
      markdown = markdown
        .split("\n")
        .filter((line) => !line.includes(`](figures/${basename})`))
        .join("\n");
  }
  const updatedFigures = figures.map((figure) => {
    const labels = figureLabels.get(figure.id);
    const labelsChanged =
      labels &&
      (labels.length !== figure.source_labels.length ||
        labels.some((label, index) => label !== figure.source_labels[index]));
    const caption = body.figureCaptions?.[figure.id];
    const description = body.figureDescriptions?.[figure.id];
    return {
      ...figure,
      selected: selected.has(figure.id),
      ...(typeof caption === "string"
        ? { caption: caption.trim().slice(0, 2000) }
        : {}),
      ...(typeof description === "string" && description.trim()
        ? { description: description.trim().slice(0, 2000) }
        : {}),
      ...(typeof caption === "string" &&
      caption.trim() !== (figure.caption || "")
        ? { caption_source: "teacher" as const }
        : {}),
      ...(labelsChanged
        ? {
            source_labels: labels,
            label_source: "teacher" as const,
            group_label:
              labels.find((label) => !/[A-Z]$/.test(label)) || undefined,
            panel_label:
              labels.find((label) => /[A-Z]$/.test(label))?.slice(-1) ||
              undefined,
          }
        : {}),
    };
  });
  markdown = synchronizeFigureText(markdown, figures, updatedFigures);
  const warnings = validateFigureManifest(markdown, updatedFigures);
  if (body.ready && warnings.length)
    return NextResponse.json(
      { error: `Resolve figure issues before approval: ${warnings.join(" ")}` },
      { status: 400 },
    );
  if (body.ready) {
    const bucket = getStorageBucket();
    const missing = await Promise.all(
      updatedFigures.map(async (figure) =>
        (await bucket.file(figure.storage_path).exists())[0]
          ? null
          : figure.figure_order,
      ),
    );
    if (missing.some((order) => order !== null))
      return NextResponse.json(
        {
          error: `Missing figure files: ${missing.filter((order) => order !== null).join(", ")}`,
        },
        { status: 409 },
      );
  }
  const index = buildDocumentIndex(markdown, updatedFigures);
  index.review_warnings = warnings;
  const path = await writeDocumentArtifact(
    documentId,
    { markdown, index },
    body.ready ? "approved" : "draft",
  );
  const { error } = await createServiceRoleClient()
    .from("class_documents")
    .update({
      title,
      tags: [...new Set(tags.map((tag) => tag.trim()))],
      draft_path: path,
      ...(body.ready ? { approved_path: path } : {}),
      status: body.ready ? "ready" : "review",
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: body.ready ? "ready" : "review" });
}

export async function DELETE(_request: NextRequest, context: Context) {
  const { documentId } = await context.params;
  const access = await documentAccess(documentId);
  if (!access)
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  const { count } = await access.db
    .from("assignment_documents")
    .select("assignment_id", { count: "exact", head: true })
    .eq("document_id", documentId);
  if (count)
    return NextResponse.json(
      { error: "Remove this document from activities before deleting it" },
      { status: 409 },
    );
  const { error } = await createServiceRoleClient()
    .from("class_documents")
    .delete()
    .eq("id", documentId);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 409 });
  await getStorageBucket().deleteFiles({
    prefix: `class-documents/${documentId}/`,
  });
  return NextResponse.json({ ok: true });
}
