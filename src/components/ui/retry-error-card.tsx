"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Purely presentational error + retry surface, shared across the multimodal
 * chat (inline), the evaluation flow, and action cards (block). Retryable
 * failures show a Retry button; non-retryable ones show guidance only.
 * See dev-docs/ai-retry-and-failure-recovery-plan.md §9.
 */
export interface RetryErrorCardProps {
  message: string;
  detail?: string;
  retryable: boolean;
  retryLabel?: string;
  onRetry?: () => void;
  disabled?: boolean;
  /**
   * When set, the Retry button counts down (from a Retry-After) before becoming
   * enabled — avoids users hammering a rate-limited endpoint.
   */
  countdownMs?: number;
  variant: "inline" | "block";
}

export function RetryErrorCard({
  message,
  detail,
  retryable,
  retryLabel = "Retry",
  onRetry,
  disabled,
  countdownMs,
  variant,
}: RetryErrorCardProps) {
  const [remainingMs, setRemainingMs] = React.useState(countdownMs ?? 0);

  React.useEffect(() => {
    if (!countdownMs || countdownMs <= 0) {
      setRemainingMs(0);
      return;
    }
    setRemainingMs(countdownMs);
    const startedAt = Date.now();
    const interval = setInterval(() => {
      const left = countdownMs - (Date.now() - startedAt);
      if (left <= 0) {
        setRemainingMs(0);
        clearInterval(interval);
      } else {
        setRemainingMs(left);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [countdownMs]);

  const counting = remainingMs > 0;
  const seconds = Math.ceil(remainingMs / 1000);

  return (
    <div
      className={cn(
        "mx-auto flex w-fit max-w-full items-center justify-center gap-2 border border-destructive/40 bg-destructive/10 text-foreground",
        variant === "inline"
          ? "rounded-lg px-3 py-2 text-sm"
          : "rounded-xl px-4 py-3 text-sm",
      )}
      role="alert"
    >
      <AlertTriangle
        className="h-4 w-4 shrink-0 text-destructive"
        aria-hidden
      />
      <p className="min-w-0">
        <span className="font-medium">{message}</span>
        {detail ? (
          <span className="ml-1 text-muted-foreground">{detail}</span>
        ) : null}
      </p>
      {retryable && onRetry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={onRetry}
          disabled={disabled || counting}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          {counting ? `${retryLabel} (${seconds}s)` : retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
