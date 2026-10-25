import type { FigureLabelSource } from "./figureLabels";

export type DocumentFigure = {
  id: string;
  page_number: number;
  figure_order: number;
  storage_path: string;
  description: string;
  caption?: string;
  selected: boolean;
  source_labels: string[];
  label_source: FigureLabelSource;
};

export type DocumentChunk = { id: number; page_number: number; heading: string | null; start: number; end: number; terms: string[] };
export type DocumentIndex = { schemaVersion: 1; chunks: DocumentChunk[]; figures: DocumentFigure[] };

function terms(text: string): string[] {
  return [...new Set((text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []))].slice(0, 300);
}

export function buildDocumentIndex(markdown: string, figures: DocumentFigure[]): DocumentIndex {
  const chunks: DocumentChunk[] = [];
  let page = 1;
  let heading: string | null = null;
  const blocks = /(?:<!-- Page (\d+) -->\s*)|(?:[^\n]+(?:\n(?!\n|<!-- Page ))*\n*)/g;
  for (const match of markdown.matchAll(blocks)) {
    if (match[1]) { page = Number(match[1]); continue; }
    const content = match[0].trim();
    if (!content) continue;
    const headingMatch = /^#{1,6}\s+(.+)$/m.exec(content);
    if (headingMatch) heading = headingMatch[1];
    const start = match.index;
    for (let offset = 0; offset < match[0].length; offset += 1400) {
      const part = match[0].slice(offset, offset + 1400);
      if (!part.trim()) continue;
      chunks.push({ id: chunks.length, page_number: page, heading, start: start + offset,
        end: Math.min(start + offset + 1400, start + match[0].length), terms: terms(`${heading || ""} ${part}`) });
    }
  }
  const indexedFigures = figures.map((figure) => {
    const basename = figure.storage_path.split("/").pop();
    const imagePosition = basename ? markdown.indexOf(`](figures/${basename})`) : -1;
    const nearby = imagePosition >= 0 ? markdown.slice(imagePosition, imagePosition + 800) : "";
    const match = /(?:^|\n)\s*((?:Fig(?:ure)?\.?)\s*\d+(?:\.\d+)*(?:[A-Z])?[^\n]*)/i.exec(nearby);
    return { ...figure, caption: match?.[1]?.trim() || figure.caption || "" };
  });
  return { schemaVersion: 1, chunks, figures: indexedFigures };
}
