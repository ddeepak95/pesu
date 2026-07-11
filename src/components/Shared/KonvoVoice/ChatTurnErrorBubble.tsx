"use client";

import { RetryErrorCard } from "@/components/ui/retry-error-card";
import type { ChatTurnError } from "./actionTypes";

/**
 * Failed-turn bubble rendered inline in the chat where an AI turn failed —
 * replaces the old banner/toast for AI-turn failures so the retry action lives
 * in the conversation. Retryable errors show a Retry button; non-retryable ones
 * show guidance only. See dev-docs/ai-retry-and-failure-recovery-plan.md §5/§9.
 */
export function ChatTurnErrorBubble({
  error,
  onRetry,
  disabled,
  attemptCount,
}: {
  error: ChatTurnError;
  onRetry?: () => void;
  disabled?: boolean;
  /** Shown on the button as "Retry (n)" once at least one retry has run. */
  attemptCount?: number;
}) {
  const retryLabel =
    attemptCount && attemptCount > 0 ? `Retry (${attemptCount + 1})` : "Retry";

  return (
    <div className="flex flex-row">
      <div className="w-full max-w-[95%] sm:max-w-[85%]">
        <RetryErrorCard
          variant="inline"
          message={error.message || "Something went wrong — please retry."}
          retryable={error.retryable}
          retryLabel={retryLabel}
          onRetry={onRetry}
          disabled={disabled}
          countdownMs={error.retryAfterMs}
        />
      </div>
    </div>
  );
}
