import type { DocumentFigure } from "./artifacts";

export function validateFigureManifest(
  markdown: string,
  figures: DocumentFigure[],
): string[] {
  const warnings: string[] = [];
  if (new Set(figures.map((figure) => figure.id)).size !== figures.length)
    warnings.push("Duplicate figure IDs in manifest.");
  if (
    new Set(figures.map((figure) => figure.storage_path)).size !==
    figures.length
  )
    warnings.push("Duplicate figure storage paths in manifest.");
  const paths = new Set(
    figures.map((figure) => figure.storage_path.split("/").pop()),
  );
  const imageRefs = [
    ...markdown.matchAll(/!\[[^\]]*\]\(figures\/([^)]+)\)/g),
  ].map((match) => match[1]);
  for (const basename of imageRefs)
    if (!paths.has(basename))
      warnings.push(`Unknown figure reference: ${basename}`);
  for (const figure of figures) {
    const basename = figure.storage_path.split("/").pop();
    const count = imageRefs.filter((value) => value === basename).length;
    if (figure.selected && count !== 1)
      warnings.push(
        `Figure ${figure.figure_order} on page ${figure.page_number} has ${count} Markdown placements; expected one.`,
      );
    if (!figure.selected && count)
      warnings.push(
        `Unselected figure ${figure.figure_order} is still in Markdown.`,
      );
  }
  const byBasename = new Map(
    figures.map((figure) => [figure.storage_path.split("/").pop(), figure]),
  );
  const pageParts = markdown.split(/<!-- Page (\d+) -->/g);
  if (
    imageRefs.length &&
    (pageParts.length < 3 || /!\[[^\]]*\]\(figures\/[^)]+\)/.test(pageParts[0]))
  ) {
    warnings.push("Figure placements need a preceding page marker.");
  }
  for (let index = 1; index < pageParts.length; index += 2) {
    const page = Number(pageParts[index]);
    for (const match of pageParts[index + 1].matchAll(
      /!\[[^\]]*\]\(figures\/([^)]+)\)/g,
    )) {
      const figure = byBasename.get(match[1]);
      if (figure && figure.page_number !== page)
        warnings.push(
          `Figure ${figure.figure_order} appears on page ${page}, but its manifest says page ${figure.page_number}.`,
        );
    }
  }
  const panels = new Map<string, Set<string>>();
  for (const figure of figures.filter(
    (item) => item.selected && item.group_label && item.panel_label,
  )) {
    const key = figure.group_label!;
    const current = panels.get(key) || new Set<string>();
    if (current.has(figure.panel_label!))
      warnings.push(`Figure group ${key} has duplicate panel labels.`);
    current.add(figure.panel_label!);
    panels.set(key, current);
  }
  return [...new Set(warnings)];
}

/** Keep a teacher's figure edits in the readable Markdown as well as the GCS index. */
export function synchronizeFigureText(
  markdown: string,
  before: DocumentFigure[],
  after: DocumentFigure[],
): string {
  let result = markdown;
  for (const figure of after) {
    const previous = before.find((item) => item.id === figure.id);
    const basename = figure.storage_path.split("/").pop();
    if (!previous || !basename || !figure.selected) continue;
    const escaped = basename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const image = new RegExp(`!\\[[^\\]]*\\]\\(figures/${escaped}\\)`);
    const found = image.exec(result);
    if (!found) continue;
    let replacement = found[0];
    if (figure.description !== previous.description) {
      replacement = `![${figure.description.replace(/[\[\]\n]/g, " ")}](figures/${basename})`;
    }
    if (figure.caption !== previous.caption) {
      const afterImage = result.slice(
        found.index + found[0].length,
        found.index + found[0].length + 500,
      );
      if (previous.caption && afterImage.includes(previous.caption)) {
        result =
          result.slice(0, found.index + found[0].length) +
          afterImage.replace(previous.caption, figure.caption || "") +
          result.slice(found.index + found[0].length + afterImage.length);
      } else if (figure.caption && !afterImage.includes(figure.caption)) {
        replacement += `\n\n${figure.caption}`;
      }
    }
    result =
      result.slice(0, found.index) +
      replacement +
      result.slice(found.index + found[0].length);
  }
  return result;
}
