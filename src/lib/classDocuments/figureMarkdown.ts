/** The figure gallery renders these private GCS images through an authorized route. */
export function stripPortableFigureImages(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\((?:\.\/)?figures\/[^)\s]+\)/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
