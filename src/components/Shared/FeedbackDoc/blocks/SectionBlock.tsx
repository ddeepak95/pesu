"use client";

import type { FeedbackBlock } from "@/types/feedbackDoc";

type Section = Extract<FeedbackBlock, { kind: "section" }>;

/** A titled section with a single plain-text content body. */
export function SectionBlock({ block }: { block: Section }) {
  const hasTitle = block.title.trim().length > 0;
  const hasContent = block.content.trim().length > 0;
  if (!hasTitle && !hasContent) return null;

  // Today the only format is "text" (rendered with newlines preserved). When a
  // WYSIWYG editor lands, add "markdown"/"html" branches here (Markdown renderer
  // + sanitizer) — `block.format` is the seam; the schema/storage stay the same.
  return (
    <section className="space-y-2">
      {hasTitle && (
        <h4 className="text-sm font-semibold text-foreground">{block.title}</h4>
      )}
      {hasContent && (
        <p className="text-sm whitespace-pre-wrap text-foreground">
          {block.content}
        </p>
      )}
    </section>
  );
}
