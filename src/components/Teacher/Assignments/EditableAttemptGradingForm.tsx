"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RubricScore } from "@/types/submission";
import type { TeacherGradingAttempt } from "@/lib/queries/submissions";

/** Composed (client-side) edit for one attempt; persisted only at Release. */
export interface AttemptGradeEdit {
  score: number;
  feedback: string;
  rubric_scores: RubricScore[];
}

interface EditableAttemptGradingFormProps {
  attempt: TeacherGradingAttempt;
  value: AttemptGradeEdit;
  onChange: (next: AttemptGradeEdit) => void;
  /** Read-only (e.g. while released — reopen to amend). */
  disabled?: boolean;
}

/** Seed the editable state from an attempt's current displayable grade. */
export function attemptToEdit(attempt: TeacherGradingAttempt): AttemptGradeEdit {
  return {
    score: attempt.score ?? 0,
    feedback: attempt.feedback ?? "",
    rubric_scores: (attempt.rubric_scores ?? []).map((r) => ({ ...r })),
  };
}

function clampScore(value: string, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), max);
}

function CompareToAI({ attempt }: { attempt: TeacherGradingAttempt }) {
  const [open, setOpen] = useState(false);
  if (attempt.ai_feedback == null && attempt.ai_score == null) return null;
  return (
    <div className="rounded-md border bg-muted/30 text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-muted-foreground"
      >
        <span>Compare to original AI evaluation</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3">
          {attempt.ai_score != null && (
            <p className="font-medium">AI score: {attempt.ai_score}</p>
          )}
          {attempt.ai_feedback && (
            <p className="whitespace-pre-wrap text-muted-foreground">
              {attempt.ai_feedback}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function EditableAttemptGradingForm({
  attempt,
  value,
  onChange,
  disabled = false,
}: EditableAttemptGradingFormProps) {
  const hasRubric = value.rubric_scores.length > 0;

  const maxPoints = useMemo(
    () =>
      hasRubric
        ? value.rubric_scores.reduce((t, r) => t + r.points_possible, 0)
        : attempt.max_score,
    [hasRubric, value.rubric_scores, attempt.max_score],
  );

  const totalPoints = hasRubric
    ? value.rubric_scores.reduce((t, r) => t + r.points_earned, 0)
    : value.score;

  const updateRubric = (index: number, patch: Partial<RubricScore>) => {
    const nextRubric = value.rubric_scores.map((r, i) =>
      i === index ? { ...r, ...patch } : r,
    );
    const nextScore = nextRubric.reduce((t, r) => t + r.points_earned, 0);
    onChange({ ...value, rubric_scores: nextRubric, score: nextScore });
  };

  return (
    <div className="space-y-5">
      <CompareToAI attempt={attempt} />

      {hasRubric && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold">Rubric</h3>
            <p className="text-sm font-semibold">
              Points Scored <span className="ml-1">{totalPoints} / {maxPoints}</span>
            </p>
          </div>
          {value.rubric_scores.map((rubricScore, index) => (
            <div key={`${rubricScore.item}-${index}`} className="space-y-2">
              <Label className="text-sm font-medium">{rubricScore.item}</Label>
              <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
                <Textarea
                  value={rubricScore.feedback}
                  onChange={(e) => updateRubric(index, { feedback: e.target.value })}
                  placeholder="Feedback"
                  rows={3}
                  disabled={disabled}
                  className="min-h-[68px] resize-none bg-background text-sm"
                />
                <div className="space-y-1">
                  <Input
                    type="number"
                    min={0}
                    max={rubricScore.points_possible}
                    step="0.5"
                    value={rubricScore.points_earned}
                    onChange={(e) =>
                      updateRubric(index, {
                        points_earned: clampScore(
                          e.target.value,
                          rubricScore.points_possible,
                        ),
                      })
                    }
                    disabled={disabled}
                    aria-label={`Points for ${rubricScore.item}`}
                    className="bg-background text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    out of {rubricScore.points_possible}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <Label className="text-base font-semibold">Overall Feedback</Label>
        <Textarea
          value={value.feedback}
          onChange={(e) => onChange({ ...value, feedback: e.target.value })}
          placeholder="Feedback"
          rows={4}
          disabled={disabled}
          className="resize-none bg-background text-sm"
        />
      </section>
    </div>
  );
}
