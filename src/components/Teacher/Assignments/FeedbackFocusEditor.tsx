"use client";

import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { FeedbackFocusArea } from "@/lib/feedbackFocus";

interface FeedbackFocusEditorProps {
  value: FeedbackFocusArea[];
  onChange: (next: FeedbackFocusArea[]) => void;
  disabled?: boolean;
}

/**
 * Editable list of teacher "Feedback focus" areas (title + description). Each
 * title becomes a section heading in the student's structured feedback; the
 * description steers what that section covers. Mirrors the rubric-item editor:
 * add / edit / remove rows.
 */
export function FeedbackFocusEditor({
  value,
  onChange,
  disabled = false,
}: FeedbackFocusEditorProps) {
  const update = (index: number, patch: Partial<FeedbackFocusArea>) =>
    onChange(value.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  const remove = (index: number) =>
    onChange(value.filter((_, i) => i !== index));
  const add = () => onChange([...value, { title: "", description: "" }]);

  return (
    <div className="space-y-3">
      <div>
        <Label>Feedback focus</Label>
        <p className="text-xs text-muted-foreground">
          Each area becomes a section in the student&apos;s feedback. The title is
          the section heading; the description tells the AI what that section
          should cover. This steers the feedback, not the score.
        </p>
      </div>

      {value.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No focus areas — the AI will choose its own feedback sections.
        </p>
      )}

      {value.map((area, i) => (
        <div key={i} className="space-y-2 rounded-md border bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <Input
              value={area.title}
              onChange={(e) => update(i, { title: e.target.value })}
              placeholder="Section title (e.g. Concept understanding)"
              disabled={disabled}
              className="bg-background"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              disabled={disabled}
              onClick={() => remove(i)}
              aria-label="Remove focus area"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Textarea
            value={area.description}
            onChange={(e) => update(i, { description: e.target.value })}
            placeholder="What should this section cover?"
            rows={2}
            disabled={disabled}
            className="resize-none bg-background text-sm"
          />
        </div>
      ))}

      {!disabled && (
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add focus area
        </Button>
      )}
    </div>
  );
}
