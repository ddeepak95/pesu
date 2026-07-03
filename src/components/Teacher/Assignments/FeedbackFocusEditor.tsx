"use client";

import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { FeedbackFocusArea } from "@/lib/feedbackFocus";

interface FeedbackFocusEditorProps {
  value: FeedbackFocusArea[];
  onChange: (next: FeedbackFocusArea[]) => void;
  disabled?: boolean;
  /** Read-only display: fields stay legible (not greyed) and the add/remove
   * affordances are hidden. */
  readOnly?: boolean;
  /** Hide the built-in "Feedback focus" label, for callers that already
   * render an equivalent heading around this editor. */
  hideLabel?: boolean;
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
  readOnly = false,
  hideLabel = false,
}: FeedbackFocusEditorProps) {
  const update = (index: number, patch: Partial<FeedbackFocusArea>) =>
    onChange(value.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  const remove = (index: number) =>
    onChange(value.filter((_, i) => i !== index));
  const add = () => onChange([...value, { title: "", description: "" }]);

  return (
    <div className="space-y-3">
      {!hideLabel && (
        <div className="flex items-center gap-1.5">
          <Label>Feedback focus</Label>
          <InfoTooltip text="Each area becomes a section in the student's feedback. The title is the section heading; the description tells the AI what that section should cover. This steers the feedback, not the score." />
        </div>
      )}

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
              readOnly={readOnly}
              className="bg-background"
            />
            {!readOnly && (
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
            )}
          </div>
          <Textarea
            value={area.description}
            onChange={(e) => update(i, { description: e.target.value })}
            placeholder="What should this section cover?"
            rows={2}
            disabled={disabled}
            readOnly={readOnly}
            className="resize-none bg-background text-sm"
          />
        </div>
      ))}

      {!disabled && !readOnly && (
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add focus area
        </Button>
      )}
    </div>
  );
}
