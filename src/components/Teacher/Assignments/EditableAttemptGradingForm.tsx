"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  invalidateSubmissionByIdCache,
  invalidateSubmissionsCache,
} from "@/hooks/swr";
import type { RubricScore, SubmissionAttempt } from "@/types/submission";

interface EditableAttemptGradingFormProps {
  attempt: SubmissionAttempt;
  submissionId: string;
  questionOrder: number;
  onSaved: (updatedAttempt: SubmissionAttempt) => void;
}

function clampScore(value: string, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), max);
}

function buildEditedRubricScores(
  attempt: SubmissionAttempt,
  feedbackDrafts: string[],
  pointDrafts: string[]
): RubricScore[] {
  return attempt.rubric_scores.map((score, index) => ({
    ...score,
    feedback: feedbackDrafts[index] ?? "",
    points_earned: clampScore(pointDrafts[index] ?? "0", score.points_possible),
  }));
}

function RubricScoreRow({
  rubricScore,
  feedback,
  points,
  disabled,
  onFeedbackChange,
  onPointsChange,
}: {
  rubricScore: RubricScore;
  feedback: string;
  points: string;
  disabled: boolean;
  onFeedbackChange: (value: string) => void;
  onPointsChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{rubricScore.item}</Label>
      <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
        <Textarea
          value={feedback}
          onChange={(event) => onFeedbackChange(event.target.value)}
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
            value={points}
            onChange={(event) => onPointsChange(event.target.value)}
            onBlur={(event) =>
              onPointsChange(
                clampScore(event.target.value, rubricScore.points_possible).toString()
              )
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
  );
}

function RubricEditor({
  rubricScores,
  feedbackDrafts,
  pointDrafts,
  totalPoints,
  maxPoints,
  disabled,
  onFeedbackChange,
  onPointsChange,
}: {
  rubricScores: RubricScore[];
  feedbackDrafts: string[];
  pointDrafts: string[];
  totalPoints: number;
  maxPoints: number;
  disabled: boolean;
  onFeedbackChange: (index: number, value: string) => void;
  onPointsChange: (index: number, value: string) => void;
}) {
  if (rubricScores.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">Rubric</h3>
        <p className="text-sm font-semibold">
          Points Scored <span className="ml-1">{totalPoints} / {maxPoints}</span>
        </p>
      </div>
      {rubricScores.map((rubricScore, index) => (
        <RubricScoreRow
          key={`${rubricScore.item}-${index}`}
          rubricScore={rubricScore}
          feedback={feedbackDrafts[index] ?? ""}
          points={pointDrafts[index] ?? "0"}
          disabled={disabled}
          onFeedbackChange={(value) => onFeedbackChange(index, value)}
          onPointsChange={(value) => onPointsChange(index, value)}
        />
      ))}
    </section>
  );
}

function OverallFeedbackField({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <section className="space-y-2">
      <Label className="text-base font-semibold">Overall Feedback</Label>
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Feedback"
        rows={4}
        disabled={disabled}
        className="resize-none bg-background text-sm"
      />
    </section>
  );
}

function GradingActions({
  saving,
  isPendingApproval,
  onSave,
}: {
  saving: boolean;
  isPendingApproval: boolean;
  onSave: () => void;
}) {
  return (
    <Button onClick={onSave} disabled={saving} className="w-full" size="sm">
      {saving ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : isPendingApproval ? (
        <CheckCircle2 className="mr-2 h-4 w-4" />
      ) : (
        <Save className="mr-2 h-4 w-4" />
      )}
      {saving ? "Saving..." : isPendingApproval ? "Save & Approve" : "Save Feedback"}
    </Button>
  );
}

export function EditableAttemptGradingForm({
  attempt,
  submissionId,
  questionOrder,
  onSaved,
}: EditableAttemptGradingFormProps) {
  const [overallFeedback, setOverallFeedback] = useState(attempt.evaluation_feedback);
  const [rubricFeedbacks, setRubricFeedbacks] = useState<string[]>(
    attempt.rubric_scores.map((score) => score.feedback)
  );
  const [rubricPoints, setRubricPoints] = useState<string[]>(
    attempt.rubric_scores.map((score) => score.points_earned.toString())
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOverallFeedback(attempt.evaluation_feedback);
    setRubricFeedbacks(attempt.rubric_scores.map((score) => score.feedback));
    setRubricPoints(attempt.rubric_scores.map((score) => score.points_earned.toString()));
    setError(null);
  }, [attempt]);

  const editedRubricScores = useMemo(
    () => buildEditedRubricScores(attempt, rubricFeedbacks, rubricPoints),
    [attempt, rubricFeedbacks, rubricPoints]
  );

  const totalPoints = useMemo(
    () => {
      if (editedRubricScores.length === 0) return attempt.score;
      return editedRubricScores.reduce(
        (total, rubricScore) => total + rubricScore.points_earned,
        0
      );
    },
    [attempt.score, editedRubricScores]
  );

  const maxPoints = useMemo(() => {
    if (attempt.rubric_scores.length === 0) return attempt.max_score;
    return attempt.rubric_scores.reduce(
      (total, rubricScore) => total + rubricScore.points_possible,
      0
    );
  }, [attempt.max_score, attempt.rubric_scores]);

  const handleRubricFeedbackChange = (index: number, value: string) => {
    setRubricFeedbacks((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleRubricPointsChange = (index: number, value: string) => {
    setRubricPoints((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/submissions/approve-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId,
          questionOrder,
          attemptNumber: attempt.attempt_number,
          evaluation_feedback: overallFeedback,
          rubric_scores:
            attempt.rubric_scores.length > 0 ? editedRubricScores : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save feedback");
      }

      const { attempt: updatedAttempt } = await res.json();
      await Promise.all([
        invalidateSubmissionByIdCache(),
        invalidateSubmissionsCache(),
      ]);
      onSaved(updatedAttempt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save feedback");
    } finally {
      setSaving(false);
    }
  };

  if (attempt.is_evaluating) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        <p>Evaluation in progress. Please refresh in a moment.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {attempt.feedback_approved === false && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          Review and optionally edit the AI-generated feedback before approving.
          Students will not see this until you approve it.
        </div>
      )}

      <RubricEditor
        rubricScores={attempt.rubric_scores}
        feedbackDrafts={rubricFeedbacks}
        pointDrafts={rubricPoints}
        totalPoints={totalPoints}
        maxPoints={maxPoints}
        disabled={saving}
        onFeedbackChange={handleRubricFeedbackChange}
        onPointsChange={handleRubricPointsChange}
      />
      <OverallFeedbackField
        value={overallFeedback}
        disabled={saving}
        onChange={setOverallFeedback}
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <GradingActions
        saving={saving}
        isPendingApproval={attempt.feedback_approved === false}
        onSave={handleSave}
      />
    </div>
  );
}
