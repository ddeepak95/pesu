"use client";

import { Clock } from "lucide-react";

/**
 * Shown to students after submitting when feedback_requires_approval is enabled
 * and the teacher has not yet approved the feedback.
 */
export function FeedbackPendingBanner() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-muted bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
      <Clock className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        Your submission is being reviewed. Please check later for feedback.
      </p>
    </div>
  );
}
