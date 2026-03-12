"use client";

import { CheckCircle2 } from "lucide-react";

/**
 * Shown to students when previously-pending feedback has been approved
 * by the teacher and is now available to view.
 */
export function FeedbackAvailableBanner() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="font-medium">Feedback available</p>
    </div>
  );
}
