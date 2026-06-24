import type { CSSProperties } from "react";

const NOISE_TEXTURE_IMAGE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cfilter id='n' color-interpolation-filters='sRGB'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export const submissionOverlayGrainStyle = {
  backgroundImage: NOISE_TEXTURE_IMAGE,
  backgroundRepeat: "repeat",
  backgroundSize: "256px 256px",
  opacity: "var(--grain-opacity)",
} satisfies CSSProperties;

export const submissionOverlayClasses = {
  shell:
    "fixed inset-0 z-50 isolate flex h-dvh max-h-dvh flex-col overflow-hidden bg-canvas text-foreground",
  grain: "pointer-events-none absolute inset-0 z-0",
  header:
    "relative z-10 flex h-20 shrink-0 items-center justify-between border-b border-border px-8",
  contentRow: "relative z-10 flex min-h-0 flex-1 overflow-hidden",
  contentPane:
    "min-h-0 flex-[5] overflow-hidden border-r-2 border-border bg-muted/35",
  gradingPane:
    "min-h-0 w-[420px] shrink-0 overflow-y-auto border-l border-border bg-card/80 p-6 xl:w-[460px]",
};
