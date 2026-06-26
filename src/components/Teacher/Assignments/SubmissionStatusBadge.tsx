"use client";

import { cn } from "@/lib/utils";

export type SubmissionLifecycleStatus = "completed" | "started" | "not_started";

type Tone = "green" | "amber" | "gray";

const TONE_CLASS: Record<Tone, string> = {
  green: "text-green-700 dark:text-green-400",
  amber: "text-amber-700 dark:text-amber-400",
  gray: "text-muted-foreground",
};

const CONFIG: Record<SubmissionLifecycleStatus, { label: string; tone: Tone }> = {
  completed: { label: "Completed", tone: "green" },
  started: { label: "In Progress", tone: "amber" },
  not_started: { label: "Not Started", tone: "gray" },
};

/** Compact date, e.g. "Jun 26, 2026". */
function formatStatusDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface SubmissionStatusBadgeProps {
  status: SubmissionLifecycleStatus;
  /** When completed, appended as "Completed on <date>". */
  submittedAt?: string | null;
  /** Optional inline label (e.g. "Submission Status:") shown before the value. */
  label?: string;
  className?: string;
}

/**
 * Whole-submission lifecycle status: whether the student has submitted, is still
 * working, or has not started. Mirrors {@link SubmissionReleaseStatusBadge}'s look.
 */
export function SubmissionStatusBadge({
  status,
  submittedAt,
  label,
  className,
}: SubmissionStatusBadgeProps) {
  const { label: baseLabel, tone } = CONFIG[status];
  const statusLabel =
    status === "completed" && submittedAt
      ? `Completed on ${formatStatusDate(submittedAt)}`
      : baseLabel;

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
