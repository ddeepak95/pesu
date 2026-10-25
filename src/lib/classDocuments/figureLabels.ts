export type FigureLabelSource = "unlabeled" | "annotation" | "nearby_text" | "teacher";

type Figure = {
  figure_order: number;
  page_number: number;
  storage_path: string;
  description: string;
  source_labels: string[];
  label_source: FigureLabelSource;
};

type Chunk = { page_number: number; content: string };

export function normalizeFigureLabel(value: string): string | null {
  const match = /^(?:fig(?:ure)?\.?\s*)?(\d+(?:\.\d+)*(?:[a-z])?)$/i.exec(value.trim());
  return match ? `Figure ${match[1].replace(/[a-z]$/i, (letter) => letter.toUpperCase())}` : null;
}

export function extractFigureLabels(value: string): string[] {
  const labels = new Set<string>();
  for (const match of value.matchAll(/\bfig(?:ure)?\.?\s*(\d+(?:\.\d+)*(?:[a-z])?)\b/gi)) {
    const label = normalizeFigureLabel(match[1]);
    if (label) labels.add(label);
  }
  return [...labels];
}

export function includeFigureGroupLabels(labels: string[]): string[] {
  const grouped = new Set<string>();
  for (const label of labels) {
    const panel = /^Figure (\d+(?:\.\d+)*)([A-Z])$/.exec(label);
    if (panel) grouped.add(`Figure ${panel[1]}`);
    grouped.add(label);
  }
  return [...grouped];
}

function expandPanels(labels: string[], description: string): string[] {
  if (labels.length !== 1) return labels;
  const panelLetters = new Set<string>();
  for (const match of description.matchAll(/(?:\b(?:part|panel)\s*\(?([ab])\)?\b|\(([ab])\))/gi)) {
    panelLetters.add((match[1] || match[2]).toUpperCase());
  }
  if (panelLetters.size < 2) return labels;
  const match = /^Figure (\d+(?:\.\d+)*)([A-Z])?$/.exec(labels[0]);
  if (!match || match[2] && !panelLetters.has(match[2])) return labels;
  return [...new Set([labels[0], ...[...panelLetters].map((letter) => `Figure ${match[1]}${letter}`)])];
}

export function suggestFigureLabels(figures: Figure[], chunks: Chunk[]): void {
  const annotationLabels = figures.flatMap((figure) => expandPanels(extractFigureLabels(figure.description), figure.description));
  const chapterCounts = new Map<string, number>();
  for (const label of annotationLabels) {
    const chapter = /^Figure (\d+)\./.exec(label)?.[1];
    if (chapter) chapterCounts.set(chapter, (chapterCounts.get(chapter) || 0) + 1);
  }
  const [leadingChapter, leadingCount] = [...chapterCounts].sort((a, b) => b[1] - a[1])[0] || [];
  const preferredChapter = leadingCount >= 2 ? leadingChapter : null;
  const claimed = new Set([...annotationLabels, ...figures.filter((figure) => figure.label_source === "teacher").flatMap((figure) => figure.source_labels)]);
  const nearbyLabels = (text: string) => extractFigureLabels(text).filter((label) => !claimed.has(label) && (!preferredChapter || label.startsWith(`Figure ${preferredChapter}.`)));
  for (const figure of figures) {
    if (figure.label_source === "teacher") continue;
    const annotationLabels = expandPanels(extractFigureLabels(figure.description), figure.description);
    if (annotationLabels.length) {
      figure.source_labels = annotationLabels;
      figure.label_source = "annotation";
      continue;
    }

    const basename = figure.storage_path.split("/").pop();
    const imageIndex = chunks.findIndex((chunk) => basename && chunk.content.includes(`](figures/${basename})`));
    if (imageIndex < 0) continue;

    const next = chunks[imageIndex + 1];
    if (next?.page_number === figure.page_number && /^\s*(?:#{1,6}\s*)?[▼▲]?\s*fig(?:ure)?\.?\s*\d/i.test(next.content)) {
      const captionLabels = expandPanels(nearbyLabels(next.content), figure.description);
      if (captionLabels.length) {
        figure.source_labels = captionLabels;
        figure.label_source = "nearby_text";
        captionLabels.forEach((label) => claimed.add(label));
        continue;
      }
    }

    const previous = chunks[imageIndex - 1];
    if (previous?.page_number === figure.page_number) {
      const previousLabels = nearbyLabels(previous.content);
      if (previousLabels.length) {
        figure.source_labels = expandPanels([previousLabels[0]], figure.description);
        figure.label_source = "nearby_text";
        figure.source_labels.forEach((label) => claimed.add(label));
        continue;
      }
    }
  }
  for (const figure of figures) figure.source_labels = includeFigureGroupLabels(figure.source_labels);
}
