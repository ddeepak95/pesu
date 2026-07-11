/**
 * Bounded retry helper for LLM API calls.
 *
 * Retries on:
 *  - HTTP 429 (rate limit)
 *  - HTTP 503 (service unavailable / overloaded)
 *  - Network errors (no status code)
 *
 * Uses exponential backoff with jitter and respects the Retry-After header
 * when present. After exhausting all attempts it re-throws the last error.
 */

export const DEFAULT_MAX_ATTEMPTS = 4;
/**
 * Silent server retries for student-facing interactive flows (multimodal turn,
 * action generation, evaluation). Kept small so a rate limit can't hold a
 * student staring at "thinking" for a minute — beyond this the user controls
 * the retry via a visible Retry button. See dev-docs/ai-retry-and-failure-
 * recovery-plan.md §4.
 */
export const INTERACTIVE_MAX_ATTEMPTS = 2;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

/**
 * Called before each backoff wait so callers can surface the retry (SSE
 * "retrying" event, admin log). `attempt` is 1-based (the attempt that just
 * failed); `error` is the thrown provider error.
 */
export type OnRetryAttempt = (attempt: number, error: unknown) => void;

export function isRetryable(error: unknown): boolean {
  if (isRetryableProviderError(error)) return true;
  if (!error || typeof error !== "object") return false;
  const statusCode = (error as Record<string, unknown>).statusCode as
    | number
    | undefined;
  // Network / timeout errors often have no statusCode on plain Error
  if (statusCode === undefined && error instanceof Error) return true;
  return false;
}

/**
 * Errors safe to recover from by restarting a stream before any bytes were
 * sent to the client (429/503 and typical fetch network failures).
 */
export function isRetryableProviderError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (!error || typeof error !== "object") return false;
  const statusCode = (error as Record<string, unknown>).statusCode as
    | number
    | undefined;
  return statusCode === 429 || statusCode === 503;
}

export function getRetryAfterMs(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const headers = (error as Record<string, unknown>).responseHeaders as
    | Record<string, string>
    | undefined;
  if (!headers) return null;
  const raw = headers["retry-after"];
  if (!raw) return null;
  const seconds = parseFloat(raw);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait before retry attempt `attemptZeroBased` (0 = first backoff after failure).
 * Uses Retry-After header when present, else exponential backoff + jitter.
 *
 * `maxDelayMs` caps the wait — interactive flows pass a short cap (~4s) so a
 * `Retry-After: 30` cannot hold an SSE stream hostage; background flows omit it
 * and fall back to the 30s default.
 */
export async function waitBeforeRetry(
  error: unknown,
  attemptZeroBased: number,
  maxDelayMs = MAX_DELAY_MS,
): Promise<void> {
  const cap = Math.min(maxDelayMs, MAX_DELAY_MS);
  const retryAfter = getRetryAfterMs(error);
  if (retryAfter !== null) {
    await delay(Math.min(retryAfter, cap));
    return;
  }
  const base = BASE_DELAY_MS * Math.pow(2, attemptZeroBased);
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  await delay(Math.min(base + jitter, cap));
}

export interface WithRetryOptions {
  maxAttempts?: number;
  /** Cap on each backoff wait (ms). Interactive callers pass ~4000. */
  maxDelayMs?: number;
  /** Invoked (1-based attempt, error) before each backoff wait. */
  onRetryAttempt?: OnRetryAttempt;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  optionsOrMaxAttempts: WithRetryOptions | number = {},
): Promise<T> {
  const options: WithRetryOptions =
    typeof optionsOrMaxAttempts === "number"
      ? { maxAttempts: optionsOrMaxAttempts }
      : optionsOrMaxAttempts;
  const {
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    maxDelayMs,
    onRetryAttempt,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (!isRetryable(err) || attempt === maxAttempts) {
        throw err;
      }

      onRetryAttempt?.(attempt, err);
      await waitBeforeRetry(err, attempt - 1, maxDelayMs);
    }
  }

  throw lastError;
}
