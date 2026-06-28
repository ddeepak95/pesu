"use client";

import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  emptyBlock,
  type FeedbackBlock,
  type FeedbackDoc,
} from "@/types/feedbackDoc";

interface FeedbackDocEditorProps {
  doc: FeedbackDoc;
  onChange: (doc: FeedbackDoc) => void;
  disabled?: boolean;
}

// --- immutable array helpers -------------------------------------------------

function replaceAt<T>(arr: T[], i: number, next: T): T[] {
  return arr.map((v, idx) => (idx === i ? next : v));
}
function removeAt<T>(arr: T[], i: number): T[] {
  return arr.filter((_, idx) => idx !== i);
}
function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const copy = arr.slice();
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

/** Up/down/delete controls for a section row. */
function RowControls({
  index,
  count,
  onMove,
  onRemove,
  disabled,
}: {
  index: number;
  count: number;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        disabled={disabled || index === 0}
        onClick={() => onMove(-1)}
        aria-label="Move section up"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        disabled={disabled || index === count - 1}
        onClick={() => onMove(1)}
        aria-label="Move section down"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        disabled={disabled}
        onClick={onRemove}
        aria-label="Remove section"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/** Editor for a single section block (title + content). */
function SectionEditor({
  block,
  index,
  count,
  onChange,
  onMove,
  onRemove,
  disabled,
}: {
  block: FeedbackBlock;
  index: number;
  count: number;
  onChange: (next: FeedbackBlock) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Section
        </span>
        <RowControls
          index={index}
          count={count}
          onMove={onMove}
          onRemove={onRemove}
          disabled={disabled}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Section title</Label>
        <Input
          value={block.title}
          onChange={(e) => onChange({ ...block, title: e.target.value })}
          placeholder="Section title"
          disabled={disabled}
          className="bg-background text-sm"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Content</Label>
        <Textarea
          value={block.content}
          onChange={(e) => onChange({ ...block, content: e.target.value })}
          placeholder="Section content"
          rows={4}
          disabled={disabled}
          className="resize-none bg-background text-sm"
        />
      </div>
    </div>
  );
}

/**
 * Full structural editor for a feedback document. Every edit goes through typed
 * controls (add a section, edit title + content, move/remove) so the document
 * stays schema-valid by construction — teachers never write JSON. The rubric
 * breakdown is rendered automatically at the end and is not edited here.
 */
export function FeedbackDocEditor({
  doc,
  onChange,
  disabled = false,
}: FeedbackDocEditorProps) {
  const setBlocks = (blocks: FeedbackBlock[]) => onChange({ ...doc, blocks });

  return (
    <div className="space-y-3">
      <Label className="text-base font-semibold">Feedback</Label>
      {doc.blocks.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No feedback sections yet. Add one below.
        </p>
      )}
      {doc.blocks.map((block, i) => (
        <SectionEditor
          key={i}
          block={block}
          index={i}
          count={doc.blocks.length}
          disabled={disabled}
          onChange={(next) => setBlocks(replaceAt(doc.blocks, i, next))}
          onMove={(dir) => setBlocks(move(doc.blocks, i, dir))}
          onRemove={() => setBlocks(removeAt(doc.blocks, i))}
        />
      ))}
      {!disabled && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setBlocks([...doc.blocks, emptyBlock()])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add section
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        The rubric breakdown is shown automatically after these sections.
      </p>
    </div>
  );
}
