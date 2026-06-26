"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  BadgeCheck,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { cn } from "@/lib/utils";

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
  // `released` here = finalized (submissions.feedback_released_at set). In batch mode
  // the student still won't see it until the assignment-level gate is opened.
  const released = grading?.released ?? false;
  const hasUnpublishedDraft = grading?.hasUnpublishedDraft ?? false;
  const batchMode = assignment?.batch_grade_release ?? false;

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

  // Composed edits, keyed by attempt id; persisted to the draft on Save or at Publish.
  const [editMap, setEditMap] = useState<Record<string, AttemptGradeEdit>>({});
  const [releasing, setReleasing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [busyReview, setBusyReview] = useState(false);
  // Explicit in-place editing of an already-released submission.
  const [editing, setEditing] = useState(false);
  const hasEdits = Object.keys(editMap).length > 0;
  // A released submission with a pending draft is implicitly in editing mode.
  const effectiveEditing = editing || (released && hasUnpublishedDraft);
  const formEditable = !released || effectiveEditing;

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

  // Seed the form from (in priority): in-memory edits, the saved draft, the
  // published values. The draft is what the teacher last saved but hasn't published.
  const currentEdit: AttemptGradeEdit | null = currentAttempt
    ? editMap[currentAttempt.id] ??
      (currentAttempt.hasDraft
        ? {
            score: currentAttempt.draft_score ?? 0,
            feedback: currentAttempt.draft_feedback ?? "",
            rubric_scores: (
              currentAttempt.draft_rubric_scores ??
              currentAttempt.rubric_scores ??
              []
            ).map((r) => ({ ...r })),
          }
        : attemptToEdit(currentAttempt))
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
    // Selection preserves any existing review. It has no student-facing effect and
    // does not publish anything (released_score is recomputed only at publish).
    await Promise.all([
      invalidateSubmissionGradingCache(submissionId),
      invalidateSubmissionsCache(),
    ]);
  };

  // Review-gate progress (questions with >= 1 non-stale attempt).
  const attemptedQuestions = useMemo(
    () => (grading?.questions ?? []).filter((q) => q.attempts.some((a) => !a.stale)),
    [grading],
  );
  const reviewedCount = attemptedQuestions.filter((q) => q.reviewed).length;
  const allReviewed =
    attemptedQuestions.length > 0 && reviewedCount === attemptedQuestions.length;

  const editsFromMap = (): AttemptEdit[] =>
    Object.entries(editMap).map(([attemptId, e]) => ({
      attemptId,
      score: e.score,
      feedback: e.feedback,
      rubric_scores: e.rubric_scores,
    }));

  // Publish: copy drafts/edits into the student-visible columns. Used for the first
  // release and for re-publishing edits to an already-released submission.
  const handlePublish = async () => {
    setReleasing(true);
    try {
      const res = await fetch("/api/submissions/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId, edits: editsFromMap() }),
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
      setEditing(false);
      await Promise.all([
        invalidateSubmissionGradingCache(submissionId),
        invalidateSubmissionsCache(),
      ]);
      showSuccessToast(
        released
          ? "Changes published."
          : batchMode
            ? "Grade finalized. It stays hidden until you release the assignment grades."
            : "Submission released to the student.",
      );
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : "Failed to release");
    } finally {
      setReleasing(false);
    }
  };

  // Save draft: persist edits privately, without changing what the student sees.
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/submissions/save-grades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId, edits: editsFromMap() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }
      setEditMap({});
      await Promise.all([
        invalidateSubmissionGradingCache(submissionId),
        invalidateSubmissionsCache(),
      ]);
      showSuccessToast("Draft saved.");
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Discard: drop unpublished drafts and revert the working state to published.
  const handleDiscard = async () => {
    setDiscarding(true);
    try {
      const res = await fetch("/api/submissions/discard-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to discard");
      }
      setEditMap({});
      setEditing(false);
      await Promise.all([
        invalidateSubmissionGradingCache(submissionId),
        invalidateSubmissionsCache(),
      ]);
      showSuccessToast("Changes discarded.");
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : "Failed to discard");
    } finally {
      setDiscarding(false);
    }
  };

  const assignmentLoading = assignmentQuery.isLoading;
  const gradingLoading = gradingQuery.isLoading;
  const isSelectedCounted =
    !!currentAttempt && gradingQuestion?.selected_attempt_id === currentAttempt.id;

  return (
    <div className="space-y-5">
      <section className="space-y-4">
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
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleSelectThisAttempt}
                    disabled={
                      isSelectedCounted || !currentAttempt || currentAttempt.stale
                    }
                    aria-pressed={isSelectedCounted}
                    aria-label="Counts toward grade"
                    className={cn(
                      "inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
                      isSelectedCounted
                        ? "border-green-600/30 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                        : "text-muted-foreground hover:bg-muted disabled:opacity-50",
                    )}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {isSelectedCounted
                    ? "This attempt counts toward the grade. Select another attempt to change it."
                    : "Make this attempt count toward the grade."}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {isSelectedCounted &&
              (gradingQuestion?.reviewed ? (
                <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                  <BadgeCheck className="h-3.5 w-3.5" /> Reviewed
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Unreviewed</span>
              ))}
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
            disabled={!formEditable}
          />
          {questionOrder !== null && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={gradingQuestion?.reviewed ?? false}
                disabled={busyReview || !formEditable}
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

      {/* Prev / Next question */}
      {!assignmentLoading && questions.length > 1 && (
        <div className="flex items-center justify-between pt-2">
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

      {/* Save draft / Release / Publish / Edit */}
      {!gradingLoading && attemptedQuestions.length > 0 && (
        <div className="space-y-2 border-t pt-4">
          {released && !effectiveEditing ? (
            <Button
              variant="outline"
              className="w-full"
              size="sm"
              onClick={() => setEditing(true)}
            >
              Edit Grade
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                className="w-full"
                size="sm"
                disabled={saving || discarding || !hasEdits}
                onClick={handleSave}
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Save draft
              </Button>
              {released ? (
                <>
                  {/* Re-publish: no review gate on an already-released grade. */}
                  <Button
                    className="w-full"
                    size="sm"
                    disabled={releasing || (!hasEdits && !hasUnpublishedDraft)}
                    onClick={handlePublish}
                  >
                    {releasing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    Publish changes
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full"
                    size="sm"
                    disabled={saving || releasing || discarding}
                    onClick={() => {
                      if (hasUnpublishedDraft) {
                        void handleDiscard();
                      } else {
                        setEditMap({});
                        setEditing(false);
                      }
                    }}
                  >
                    {discarding ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {hasUnpublishedDraft ? "Discard changes" : "Cancel"}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    className="w-full"
                    size="sm"
                    disabled={releasing || !allReviewed}
                    onClick={handlePublish}
                  >
                    {releasing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    {batchMode ? "Finalize grade" : "Grade Submission"}
                  </Button>
                  {batchMode && allReviewed && (
                    <p className="text-xs text-muted-foreground text-center">
                      Hidden from the student until you release the assignment grades.
                    </p>
                  )}
                  {!allReviewed && (
                    <p className="text-xs text-muted-foreground text-center">
                      Review every question to enable grading ({reviewedCount}/
                      {attemptedQuestions.length}).
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
