/**
 * Fixed categorical order (dataviz skill's validated 8-slot palette,
 * references/palette.md) — same modality always gets the same color across
 * months/cards, never reassigned by which modalities happen to be present.
 * Slot 8 (red) is the fallback for any future/unrecognized usage_type label.
 */
const MODALITY_COLOR_CLASSES: Record<string, string> = {
  "Text generation": "bg-[#2a78d6] dark:bg-[#3987e5]", // slot 1 — blue
  "Speech to text": "bg-[#008300] dark:bg-[#008300]", // slot 2 — green
  "Text to speech": "bg-[#e87ba4] dark:bg-[#d55181]", // slot 3 — magenta
  "Realtime dialogue": "bg-[#eda100] dark:bg-[#c98500]", // slot 4 — yellow
  "Image generation": "bg-[#1baf7a] dark:bg-[#199e70]", // slot 5 — aqua
  "Video generation": "bg-[#eb6834] dark:bg-[#d95926]", // slot 6 — orange
  Embedding: "bg-[#4a3aa7] dark:bg-[#9085e9]", // slot 7 — violet
};

const FALLBACK_COLOR_CLASS = "bg-[#e34948] dark:bg-[#e66767]"; // slot 8 — red

export function modalityColorClass(dimension: string): string {
  return MODALITY_COLOR_CLASSES[dimension] ?? FALLBACK_COLOR_CLASS;
}
