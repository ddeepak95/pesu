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
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

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

function getRetryAfterMs(error: unknown): number | null {
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
 */
export async function waitBeforeRetry(
  error: unknown,
  attemptZeroBased: number,
): Promise<void> {
  const retryAfter = getRetryAfterMs(error);
  if (retryAfter !== null) {
    await delay(Math.min(retryAfter, MAX_DELAY_MS));
    return;
  }
  const base = BASE_DELAY_MS * Math.pow(2, attemptZeroBased);
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  await delay(Math.min(base + jitter, MAX_DELAY_MS));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (!isRetryable(err) || attempt === maxAttempts) {
        throw err;
      }

      await waitBeforeRetry(err, attempt - 1);
    }
  }

  throw lastError;
}
