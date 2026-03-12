"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2 } from "lucide-react";
import { SubmissionAttempt, RubricScore } from "@/types/submission";

interface FeedbackApprovalEditorProps {
  attempt: SubmissionAttempt;
  submissionId: string;
  questionOrder: number;
  onApproved: (updatedAttempt: SubmissionAttempt) => void;
}

/**
 * Teacher-facing panel for reviewing, optionally editing, and approving
 * AI-generated feedback before it is shown to the student.
 *
 * Self-contained: manages its own draft state and loading state.
 */
export function FeedbackApprovalEditor({
  attempt,
  submissionId,
  questionOrder,
  onApproved,
}: FeedbackApprovalEditorProps) {
  const [overallFeedback, setOverallFeedback] = useState(
    attempt.evaluation_feedback
  );
  const [rubricFeedbacks, setRubricFeedbacks] = useState<string[]>(
    attempt.rubric_scores.map((r) => r.feedback)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRubricFeedbackChange = (index: number, value: string) => {
    setRubricFeedbacks((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleApprove = async () => {
    setSaving(true);
    setError(null);

    const editedRubricScores: RubricScore[] = attempt.rubric_scores.map(
      (r, i) => ({ ...r, feedback: rubricFeedbacks[i] })
    );

    try {
      const res = await fetch("/api/submissions/approve-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId,
          questionOrder,
          attemptNumber: attempt.attempt_number,
          evaluation_feedback: overallFeedback,
          rubric_scores: editedRubricScores,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to approve feedback");
      }

      const { attempt: updatedAttempt } = await res.json();
      onApproved(updatedAttempt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve feedback");
    } finally {
      setSaving(false);
    }
  };

  // LLM is still running — show a non-interactive placeholder
  if (attempt.is_evaluating) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-muted bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        <p>Evaluation in progress. Please refresh in a moment.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
        Review and optionally edit the AI-generated feedback before approving.
        Students will not see this until you approve it.
      </div>

      {/* Overall feedback */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Overall Feedback</Label>
        <Textarea
          value={overallFeedback}
          onChange={(e) => setOverallFeedback(e.target.value)}
          rows={4}
          disabled={saving}
          className="resize-none text-sm"
        />
      </div>

      {/* Per-rubric-item feedback */}
      {attempt.rubric_scores.length > 0 && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">Rubric Item Feedback</Label>
          {attempt.rubric_scores.map((rubricScore, index) => (
            <div key={index} className="space-y-1.5 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{rubricScore.item}</span>
                <span className="text-xs text-muted-foreground">
                  {rubricScore.points_earned} / {rubricScore.points_possible} pts
                </span>
              </div>
              <Textarea
                value={rubricFeedbacks[index]}
                onChange={(e) =>
                  handleRubricFeedbackChange(index, e.target.value)
                }
                rows={2}
                disabled={saving}
                className="resize-none text-sm"
              />
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Button
        onClick={handleApprove}
        disabled={saving}
        className="w-full"
        size="sm"
      >
        <CheckCircle2 className="mr-2 h-4 w-4" />
        {saving ? "Approving..." : "Save & Approve"}
      </Button>
    </div>
  );
}
