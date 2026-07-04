"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FeedbackBlock, FeedbackDoc } from "@/types/feedbackDoc";

// Adding new sections is disabled for now (kept for a possible future re-enable).
const ALLOW_ADD_SECTION = false;

interface FeedbackDocEditorProps {
  doc: FeedbackDoc;
  onChange: (doc: FeedbackDoc) => void;
  disabled?: boolean;
}

function replaceAt<T>(arr: T[], i: number, next: T): T[] {
  return arr.map((v, idx) => (idx === i ? next : v));
}

/** Editor for a single section block: static title, editable content — mirrors the rubric item layout. */
function SectionEditor({
  block,
  onChange,
  disabled,
}: {
  block: FeedbackBlock;
  onChange: (next: FeedbackBlock) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{block.title}</Label>
      <Textarea
        value={block.content}
        onChange={(e) => onChange({ ...block, content: e.target.value })}
        placeholder="Feedback"
        rows={3}
        disabled={disabled}
        className="min-h-[68px] resize-none bg-background text-sm"
      />
    </div>
  );
}

/**
 * Structural editor for a feedback document's sections. Section titles and
 * ordering come from the AI-generated structure and aren't editable here —
 * only each section's content. The rubric breakdown is rendered automatically
 * at the end and is not edited here.
 */
export function FeedbackDocEditor({
  doc,
  onChange,
  disabled = false,
}: FeedbackDocEditorProps) {
  const setBlocks = (blocks: FeedbackBlock[]) => onChange({ ...doc, blocks });

  return (
    <div className="space-y-4">
      <Label className="text-base font-semibold">Feedback</Label>
      {doc.blocks.length === 0 && (
        <p className="text-sm text-muted-foreground">No feedback sections yet.</p>
      )}
      {doc.blocks.map((block, i) => (
        <SectionEditor
          key={i}
          block={block}
          disabled={disabled}
          onChange={(next) => setBlocks(replaceAt(doc.blocks, i, next))}
        />
      ))}
      {ALLOW_ADD_SECTION && !disabled && (
        <p className="text-xs text-muted-foreground">Add section (hidden)</p>
      )}
      <p className="text-xs text-muted-foreground">
        The rubric breakdown is shown automatically after these sections.
      </p>
    </div>
  );
}
