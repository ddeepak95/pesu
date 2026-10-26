import type { DocumentFigure } from "./index";

export type LayoutStage = {
  pageCount: number;
  pages: Array<{ pageNumber: number; blocks: string[] }>;
  figures: DocumentFigure[];
};

export function runPrefix(documentId: string, runId: string): string {
  return `class-documents/${documentId}/runs/${runId}`;
}

export function layoutPath(documentId: string, runId: string): string {
  return `${runPrefix(documentId, runId)}/layout.json`;
}

/** Preserve Document AI page boundaries while assembling a reviewable draft. */
export function markdownFromLayoutStage(stage: LayoutStage): string {
  if (
    !Number.isInteger(stage.pageCount) ||
    stage.pageCount < 1 ||
    !Array.isArray(stage.pages) ||
    stage.pages.length !== stage.pageCount ||
    !Array.isArray(stage.figures) ||
    stage.pages.some(
      (page, index) =>
        page.pageNumber !== index + 1 ||
        !Array.isArray(page.blocks) ||
        page.blocks.some((block) => typeof block !== "string"),
    )
  ) {
    throw new Error("Invalid Document AI layout stage");
  }
  const markdown = stage.pages
    .map(
      (page) =>
        `<!-- Page ${page.pageNumber} -->\n\n${page.blocks.join("\n\n").trim()}`,
    )
    .join("\n\n");
  if (!markdown.replace(/<!-- Page \d+ -->/g, "").trim())
    throw new Error("Document AI returned no readable content");
  return markdown;
}
