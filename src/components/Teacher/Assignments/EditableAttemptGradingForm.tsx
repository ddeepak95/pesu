"use client";

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RubricScore } from "@/types/submission";
import {
  flattenFeedbackDoc,
  type FeedbackDoc,
} from "@/types/feedbackDoc";
import type { TeacherGradingAttempt } from "@/lib/queries/submissions";
import { FeedbackDocEditor } from "@/components/Teacher/Assignments/FeedbackDocEditor";
import { formatPoints, roundScore } from "@/lib/utils/scoreDisplay";

/** Composed (client-side) edit for one attempt; persisted to a draft on Save, published at Release. */
export interface AttemptGradeEdit {
  score: number;
  /** Flattened plain-text feedback — kept in sync with feedback_doc when present. */
  feedback: string;
  /** Structured document (null for legacy attempts, which edit `feedback` directly). */
  feedback_doc: FeedbackDoc | null;
  rubric_scores: RubricScore[];
}

interface EditableAttemptGradingFormProps {
  attempt: TeacherGradingAttempt;
  value: AttemptGradeEdit;
  onChange: (next: AttemptGradeEdit) => void;
  /** Read-only (e.g. while released and not in edit mode — click Edit Grade to amend). */
  disabled?: boolean;
}

/** Seed the editable state from an attempt's current displayable grade. */
export function attemptToEdit(attempt: TeacherGradingAttempt): AttemptGradeEdit {
  return {
    score: attempt.score ?? 0,
    feedback: attempt.feedback ?? "",
    feedback_doc: attempt.feedback_doc ?? null,
    rubric_scores: (attempt.rubric_scores ?? []).map((r) => ({ ...r })),
  };
}

function clampScore(value: string, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return roundScore(Math.min(Math.max(parsed, 0), max));
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
    const nextScore = roundScore(
      nextRubric.reduce((t, r) => t + r.points_earned, 0),
    );
    onChange({ ...value, rubric_scores: nextRubric, score: nextScore });
  };

  return (
    <div className="space-y-5">
      {hasRubric && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold">Rubric</h3>
            <p className="text-sm font-semibold">
              Points Scored <span className="ml-1">{formatPoints(totalPoints)} / {formatPoints(maxPoints)}</span>
            </p>
          </div>
          {value.rubric_scores.map((rubricScore, index) => (
            <div key={`${rubricScore.item}-${index}`} className="space-y-2">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <Label className="pt-2 text-sm font-medium">{rubricScore.item}</Label>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <Input
                    type="number"
                    min={0}
                    max={rubricScore.points_possible}
                    step="0.05"
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
                    className="w-16 bg-background text-sm"
                  />
                  <span className="whitespace-nowrap text-sm text-muted-foreground">
                    / {rubricScore.points_possible}
                  </span>
                </div>
              </div>
              <Textarea
                value={rubricScore.feedback}
                onChange={(e) => updateRubric(index, { feedback: e.target.value })}
                placeholder="Feedback"
                rows={3}
                disabled={disabled}
                className="min-h-[68px] resize-none bg-background text-sm"
              />
            </div>
          ))}
        </section>
      )}

      {value.feedback_doc ? (
        // Structured feedback: edit via typed controls. Keep the flattened
        // plain-text `feedback` in sync so the legacy fallback stays accurate.
        <FeedbackDocEditor
          doc={value.feedback_doc}
          disabled={disabled}
          onChange={(doc) =>
            onChange({
              ...value,
              feedback_doc: doc,
              feedback: flattenFeedbackDoc(doc),
            })
          }
        />
      ) : (
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
      )}
    </div>
  );
}
