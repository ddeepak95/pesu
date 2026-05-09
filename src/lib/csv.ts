/** Escape a cell for RFC 4180-style CSV (Excel-friendly). */
export function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function sanitizeFilenameSegment(
  segment: string,
  emptyFallback = "export"
): string {
  const cleaned = segment
    .replace(/[/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 80) || emptyFallback;
}

/** Prefix for UTF-8 CSV so Excel recognizes encoding. */
export const CSV_UTF8_BOM = "\uFEFF";
