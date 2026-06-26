"use client";

import { cn } from "@/lib/utils";
import { useAssignmentByIdForTeacher, useSubmissionGrading } from "@/hooks/swr";

interface SubmissionReleaseStatusBadgeProps {
  submissionId: string;
  /** When provided, lets the badge reflect the batch-mode "finalized but hidden" state. */
  assignmentId?: string;
  /** Optional inline label (e.g. "Grading Status:") shown before the value; hides with the badge. */
  label?: string;
  className?: string;
}

type Tone = "green" | "amber" | "blue";

const TONE_CLASS: Record<Tone, string> = {
  green: "text-green-700 dark:text-green-400",
  amber: "text-amber-700 dark:text-amber-400",
  blue: "text-blue-700 dark:text-blue-400",
};

/** Compact date, e.g. "Jun 26, 2026". */
function formatStatusDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Whole-submission grading status shown next to the student details. States:
 * "Ungraded" (not finalized), "Unpublished changes" (finalized with a pending draft),
 * "Finalized · hidden" (batch mode, finalized but the assignment gate is closed), and
 * "Graded" (finalized and visible). Renders nothing until there is something to grade.
 */
export function SubmissionReleaseStatusBadge({
  submissionId,
  assignmentId,
  label,
  className,
}: SubmissionReleaseStatusBadgeProps) {
  const { data } = useSubmissionGrading(submissionId);
  const { data: assignment } = useAssignmentByIdForTeacher(assignmentId ?? "");
  if (!data) return null;

  const attemptedQuestions = data.questions.filter((q) =>
    q.attempts.some((a) => !a.stale),
  );
  if (attemptedQuestions.length === 0) return null;

  const batchMode = assignment?.batch_grade_release ?? false;
  const gateOpen = assignment?.grades_released_at != null;

  let statusLabel: string;
  let tone: Tone;
  if (!data.released) {
    statusLabel = "Ungraded";
    tone = "amber";
  } else if (data.hasUnpublishedDraft) {
    statusLabel = "Unpublished changes";
    tone = "blue";
  } else if (batchMode && !gateOpen) {
    statusLabel = "Finalized · hidden";
    tone = "blue";
  } else {
    statusLabel = data.releasedAt
      ? `Graded on ${formatStatusDate(data.releasedAt)}`
      : "Graded";
    tone = "green";
  }

  return (
    <div className={cn("inline-flex items-center gap-2 text-xs", className)}>
      {label && (
        <span className="font-medium text-muted-foreground">{label}</span>
      )}
      <div className="inline-flex items-center gap-3 rounded-md border px-3 py-1.5">
        <span className={cn("font-medium", TONE_CLASS[tone])}>{statusLabel}</span>
      </div>
    </div>
  );
}
