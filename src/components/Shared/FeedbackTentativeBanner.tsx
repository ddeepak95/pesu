"use client";

import { Info } from "lucide-react";

/**
 * Shown to students for a per-attempt result that is still tentative — i.e. the
 * assignment requires teacher approval and the submission has not been released.
 * The AI score + feedback are shown openly, but the wording must make clear this
 * is a provisional score for THIS attempt, not the student's final grade.
 */
export function FeedbackTentativeBanner() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-0.5">
        <p className="font-medium">Tentative score for this attempt</p>
        <p className="text-amber-800 dark:text-amber-300">
          This AI-generated score and feedback are pending teacher review. Your
          grade isn&apos;t final yet and may change after your teacher releases it.
        </p>
      </div>
    </div>
  );
}
