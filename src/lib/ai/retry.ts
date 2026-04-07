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

const DEFAULT_MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

function isRetryable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  // AI SDK wraps provider errors with a statusCode property
  const statusCode = (error as Record<string, unknown>).statusCode as
    | number
    | undefined;
  if (statusCode === 429 || statusCode === 503) return true;
  // Network / timeout errors have no statusCode
  if (statusCode === undefined && error instanceof Error) return true;
  return false;
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

      const retryAfter = getRetryAfterMs(err);
      if (retryAfter !== null) {
        await delay(Math.min(retryAfter, MAX_DELAY_MS));
      } else {
        // Exponential backoff with ±20% jitter
        const base = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        const jitter = base * 0.2 * (Math.random() * 2 - 1);
        await delay(Math.min(base + jitter, MAX_DELAY_MS));
      }
    }
  }

  throw lastError;
}
