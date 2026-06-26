"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EditableAttemptGradingForm,
  attemptToEdit,
  type AttemptGradeEdit,
} from "@/components/Teacher/Assignments/EditableAttemptGradingForm";
import type { TeacherGradingAttempt } from "@/lib/queries/submissions";
import type { AttemptEdit } from "@/lib/submissions/grading";
import {
  invalidateSubmissionGradingCache,
  invalidateSubmissionsCache,
  selectAttempt,
  useAssignmentByIdForTeacher,
  useSubmissionById,
  useSubmissionGrading,
} from "@/hooks/swr";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

function SkeletonLine({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-muted ${className ?? "h-4 w-full"}`} />
  );
}

interface SubmissionGradingPanelProps {
  submissionId: string;
  assignmentId: string;
  selectedQuestionIndex: number;
  onQuestionChange: (index: number) => void;
  selectedAttemptNumber: number | null;
  onAttemptChange: (attemptNumber: number | null) => void;
}

export function SubmissionGradingPanel({
  submissionId,
  assignmentId,
  selectedQuestionIndex,
  onQuestionChange,
  selectedAttemptNumber,
  onAttemptChange,
}: SubmissionGradingPanelProps) {
  const assignmentQuery = useAssignmentByIdForTeacher(assignmentId);
  const fullSubmissionQuery = useSubmissionById(submissionId);
  const gradingQuery = useSubmissionGrading(submissionId);

  const assignment = assignmentQuery.data ?? null;
  const fullSubmission = fullSubmissionQuery.data ?? null;
  const grading = gradingQuery.data ?? null;
  const released = grading?.released ?? false;

  // Question prompts come from the assignment (or per-submission generated set).
  const questions = useMemo(() => {
    if (!assignment) return [];
    if (assignment.dynamic_questions_enabled && fullSubmission?.generated_questions) {
      return [...fullSubmission.generated_questions].sort((a, b) => a.order - b.order);
    }
    return [...(assignment.questions ?? [])].sort((a, b) => a.order - b.order);
  }, [assignment, fullSubmission]);

  const currentQuestion = questions[selectedQuestionIndex] ?? null;
  const questionOrder = currentQuestion?.order ?? null;

  const gradingQuestion = useMemo(
    () => grading?.questions.find((q) => q.question_order === questionOrder) ?? null,
    [grading, questionOrder],
  );
  const attempts = useMemo(
    () => gradingQuestion?.attempts ?? [],
    [gradingQuestion],
  );

  // Composed edits, keyed by attempt id, persisted only at Release.
  const [editMap, setEditMap] = useState<Record<string, AttemptGradeEdit>>({});
  const [releasing, setReleasing] = useState(false);
  const [busyReview, setBusyReview] = useState(false);

  // Default the selected attempt to the last non-stale one.
  useEffect(() => {
    if (gradingQuery.isLoading) return;
    if (attempts.length === 0) {
      if (selectedAttemptNumber !== null) onAttemptChange(null);
      return;
    }
    if (attempts.some((a) => a.attempt_number === selectedAttemptNumber)) return;
    const nonStale = attempts.filter((a) => !a.stale);
    const fallback =
      nonStale.length > 0 ? nonStale[nonStale.length - 1] : attempts[attempts.length - 1];
    onAttemptChange(fallback.attempt_number);
  }, [gradingQuery.isLoading, attempts, selectedAttemptNumber, onAttemptChange]);

  const currentAttempt: TeacherGradingAttempt | null =
    selectedAttemptNumber !== null
      ? attempts.find((a) => a.attempt_number === selectedAttemptNumber) ?? null
      : null;

  const currentEdit: AttemptGradeEdit | null = currentAttempt
    ? editMap[currentAttempt.id] ?? attemptToEdit(currentAttempt)
    : null;

  const markReviewed = useCallback(
    async (order: number, reviewed: boolean) => {
      const res = await fetch("/api/submissions/review-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId, questionOrder: order, reviewed }),
      });
      if (!res.ok) {
        showErrorToast("Could not update review state.");
        return;
      }
      await invalidateSubmissionGradingCache(submissionId);
    },
    [submissionId],
  );

  const handleEditChange = (attempt: TeacherGradingAttempt, next: AttemptGradeEdit) => {
    setEditMap((prev) => ({ ...prev, [attempt.id]: next }));
    // Auto-mark the question reviewed the first time the teacher edits it.
    if (gradingQuestion && !gradingQuestion.reviewed && questionOrder !== null) {
      void markReviewed(questionOrder, true);
    }
  };

  const handleSelectThisAttempt = async () => {
    if (!currentAttempt || questionOrder === null) return;
    const res = await selectAttempt({
      submissionId,
      questionOrder,
      attemptNumber: currentAttempt.attempt_number,
    });
    if (!res.ok) {
      showErrorToast("Could not change the counted attempt.");
      return;
    }
    // Teacher selection clears the review server-side; refresh grading state.
    await invalidateSubmissionGradingCache(submissionId);
  };

  // Review-gate progress (questions with >= 1 non-stale attempt).
  const attemptedQuestions = useMemo(
    () => (grading?.questions ?? []).filter((q) => q.attempts.some((a) => !a.stale)),
    [grading],
  );
  const reviewedCount = attemptedQuestions.filter((q) => q.reviewed).length;
  const allReviewed =
    attemptedQuestions.length > 0 && reviewedCount === attemptedQuestions.length;

  const handleRelease = async () => {
    setReleasing(true);
    try {
      const edits: AttemptEdit[] = Object.entries(editMap).map(
        ([attemptId, e]) => ({
          attemptId,
          score: e.score,
          feedback: e.feedback,
          rubric_scores: e.rubric_scores,
        }),
      );
      const res = await fetch("/api/submissions/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId, edits }),
      });
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        const orders: number[] = data.questionOrders ?? [];
        showErrorToast(
          `Review every question before releasing. Unreviewed: ${orders
            .map((o) => o + 1)
            .join(", ")}`,
        );
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to release");
      }
      setEditMap({});
      await Promise.all([
        invalidateSubmissionGradingCache(submissionId),
        invalidateSubmissionsCache(),
      ]);
      showSuccessToast("Submission released to the student.");
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : "Failed to release");
    } finally {
      setReleasing(false);
    }
  };

  const handleReopen = async () => {
    setReleasing(true);
    try {
      const res = await fetch("/api/submissions/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId, reopen: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to reopen");
      }
      setEditMap({});
      await Promise.all([
        invalidateSubmissionGradingCache(submissionId),
        invalidateSubmissionsCache(),
      ]);
      showSuccessToast("Submission reopened — it is tentative again.");
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : "Failed to reopen");
    } finally {
      setReleasing(false);
    }
  };

  const assignmentLoading = assignmentQuery.isLoading;
  const gradingLoading = gradingQuery.isLoading;
  const isDynamic =
    assignment?.dynamic_questions_enabled && !!fullSubmission?.generated_questions;
  const isSelectedCounted =
    !!currentAttempt && gradingQuestion?.selected_attempt_id === currentAttempt.id;

  return (
    <div className="space-y-5">
      {/* Release status + progress */}
      {!gradingLoading && grading && (
        <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
          <span
            className={
              released
                ? "font-medium text-green-700 dark:text-green-400"
                : "font-medium text-amber-700 dark:text-amber-400"
            }
          >
            {released ? "Released" : "Held (tentative)"}
          </span>
          <span className="text-muted-foreground">
            Reviewed {reviewedCount} / {attemptedQuestions.length}
          </span>
        </div>
      )}

      <section className="space-y-4">
        {/* Question nav header */}
        {assignmentLoading ? (
          <div className="flex items-center justify-between">
            <SkeletonLine className="h-5 w-24" />
            <SkeletonLine className="h-5 w-16" />
          </div>
        ) : questions.length > 0 ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">
                Question {selectedQuestionIndex + 1}
              </span>
              {isDynamic && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  Dynamic
                </span>
              )}
              {gradingQuestion?.reviewed && (
                <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Reviewed
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={selectedQuestionIndex <= 0}
                onClick={() => onQuestionChange(selectedQuestionIndex - 1)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span>{selectedQuestionIndex + 1}/{questions.length}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={selectedQuestionIndex >= questions.length - 1}
                onClick={() => onQuestionChange(selectedQuestionIndex + 1)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : null}

        {/* Question prompt */}
        {assignmentLoading ? (
          <div className="space-y-2">
            <SkeletonLine className="h-4 w-full" />
            <SkeletonLine className="h-4 w-3/4" />
          </div>
        ) : currentQuestion ? (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {currentQuestion.prompt}
          </p>
        ) : null}

        {/* Attempt selector + counted indicator */}
        {gradingLoading ? (
          <SkeletonLine className="h-9 w-40" />
        ) : attempts.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={selectedAttemptNumber?.toString() ?? ""}
              onValueChange={(value) => onAttemptChange(value ? parseInt(value) : null)}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Select attempt" />
              </SelectTrigger>
              <SelectContent>
                {attempts.map((attempt) => (
                  <SelectItem
                    key={attempt.attempt_number}
                    value={attempt.attempt_number.toString()}
                  >
                    Attempt {attempt.attempt_number}
                    {attempt.stale ? " (stale)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isSelectedCounted ? (
              <span className="text-xs text-muted-foreground">Counts toward grade</span>
            ) : (
              !released &&
              currentAttempt &&
              !currentAttempt.stale && (
                <Button variant="outline" size="sm" onClick={handleSelectThisAttempt}>
                  Make this count
                </Button>
              )
            )}
          </div>
        ) : null}
      </section>

      {/* Grading form */}
      {gradingLoading ? (
        <div className="space-y-3">
          <SkeletonLine className="h-20 w-full" />
          <SkeletonLine className="h-20 w-full" />
        </div>
      ) : currentAttempt && currentEdit ? (
        <>
          <EditableAttemptGradingForm
            attempt={currentAttempt}
            value={currentEdit}
            onChange={(next) => handleEditChange(currentAttempt, next)}
            disabled={released}
          />
          {questionOrder !== null && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={gradingQuestion?.reviewed ?? false}
                disabled={busyReview || released}
                onChange={async (e) => {
                  setBusyReview(true);
                  await markReviewed(questionOrder, e.target.checked);
                  setBusyReview(false);
                }}
              />
              Mark this question reviewed
            </label>
          )}
        </>
      ) : !gradingLoading && attempts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No attempts for this question yet.
        </p>
      ) : null}

      {/* Release / Reopen */}
      {!gradingLoading && attemptedQuestions.length > 0 && (
        <div className="space-y-2 border-t pt-4">
          {released ? (
            <Button
              variant="outline"
              className="w-full"
              size="sm"
              disabled={releasing}
              onClick={handleReopen}
            >
              {releasing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Re-open to amend
            </Button>
          ) : (
            <>
              <Button
                className="w-full"
                size="sm"
                disabled={releasing || !allReviewed}
                onClick={handleRelease}
              >
                {releasing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Release submission
              </Button>
              {!allReviewed && (
                <p className="text-xs text-muted-foreground text-center">
                  Review every question to enable release ({reviewedCount}/
                  {attemptedQuestions.length}).
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Prev / Next question */}
      {!assignmentLoading && questions.length > 1 && (
        <div className="flex items-center justify-between pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            disabled={selectedQuestionIndex <= 0}
            onClick={() => onQuestionChange(selectedQuestionIndex - 1)}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Prev Question
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={selectedQuestionIndex >= questions.length - 1}
            onClick={() => onQuestionChange(selectedQuestionIndex + 1)}
          >
            Next Question
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
