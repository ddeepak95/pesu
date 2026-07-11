"use client";

import * as React from "react";
import type { ClassifiedAiError } from "@/lib/ai/errors";

/**
 * Thin standardization of a retryable async request: it remembers the last
 * arguments a wrapped fn was called with, tracks the current failure (if any),
 * and exposes a `retry()` that re-invokes with those same args.
 *
 * It deliberately does NOT own any streaming lifecycle (e.g. the multimodal
 * turn loop) — those stay in the feature components. See
 * dev-docs/ai-retry-and-failure-recovery-plan.md §9.
 */
export interface UseRetryableRequest<Args extends unknown[]> {
  failure: ClassifiedAiError | null;
  attemptCount: number;
  /** Call the wrapped fn, remembering its args for a later retry. */
  run: (...args: Args) => Promise<void>;
  /** Record a failure (e.g. from a caller's own catch). */
  fail: (error: ClassifiedAiError) => void;
  /** Clear the current failure without retrying. */
  clear: () => void;
  /** Re-invoke the wrapped fn with the last args; no-op if never run. */
  retry: () => Promise<void>;
}

export function useRetryableRequest<Args extends unknown[]>(
  fn: (...args: Args) => Promise<void>,
): UseRetryableRequest<Args> {
  const [failure, setFailure] = React.useState<ClassifiedAiError | null>(null);
  const [attemptCount, setAttemptCount] = React.useState(0);
  const lastArgsRef = React.useRef<Args | null>(null);
  const fnRef = React.useRef(fn);
  React.useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const run = React.useCallback(async (...args: Args) => {
    lastArgsRef.current = args;
    await fnRef.current(...args);
  }, []);

  const fail = React.useCallback((error: ClassifiedAiError) => {
    setFailure(error);
  }, []);

  const clear = React.useCallback(() => {
    setFailure(null);
  }, []);

  const retry = React.useCallback(async () => {
    if (!lastArgsRef.current) return;
    setFailure(null);
    setAttemptCount((c) => c + 1);
    await fnRef.current(...lastArgsRef.current);
  }, []);

  return { failure, attemptCount, run, fail, clear, retry };
}
