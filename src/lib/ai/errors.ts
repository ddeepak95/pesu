/**
 * Unified AI-error classification: maps any thrown provider error (or one of the
 * app's existing ad-hoc error-code constants) to a single machine-readable
 * `AiErrorCode` + a `retryable` flag, so every surface — SSE events, JSON
 * responses, and the client — decides UI treatment from `code`/`retryable`
 * rather than string-matching messages.
 *
 * Composes with src/lib/ai/retry.ts (delegates the "is this a transient provider
 * blip" question to its `isRetryableProviderError` / `getRetryAfterMs` logic).
 * See dev-docs/ai-retry-and-failure-recovery-plan.md §3.
 */

import { getRetryAfterMs } from "./retry";
import { AI_NOT_CONFIGURED_ERROR_CODE } from "./credentials/constants";
import { QUOTA_EXCEEDED_ERROR_CODE } from "./metering/constants";
import { MULTIMODAL_ERROR_CODES } from "@/lib/multimodal/errorCodes";
import { INTEGRITY_ACCESS_REVOKED_ERROR_CODE } from "@/lib/integrity/constants";

export type AiErrorCode =
  | "RATE_LIMITED" // 429
  | "PROVIDER_UNAVAILABLE" // 503 / overloaded
  | "NETWORK" // fetch TypeError, socket reset
  | "TIMEOUT"
  | "AI_NOT_CONFIGURED" // existing AI_NOT_CONFIGURED_ERROR_CODE
  | "QUOTA_EXCEEDED" // wallet exhausted under block enforcement (Phase 3 D11)
  | "CAPABILITY_MISMATCH" // existing AUDIO_INPUT_CAPABILITY_MISMATCH
  | "INTEGRITY_REVOKED" // existing integrity access revoked code
  | "BAD_REQUEST" // 400/422, schema-invalid input
  | "UNKNOWN";

export interface ClassifiedAiError {
  code: AiErrorCode;
  message: string;
  /** true for RATE_LIMITED, PROVIDER_UNAVAILABLE, NETWORK, TIMEOUT, UNKNOWN. */
  retryable: boolean;
  /** From the Retry-After header, when present. */
  retryAfterMs?: number;
}

/** Codes whose failures are worth retrying. `undefined`/`UNKNOWN` ⇒ retryable. */
const RETRYABLE_CODES: ReadonlySet<AiErrorCode> = new Set([
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "NETWORK",
  "TIMEOUT",
  "UNKNOWN",
]);

export function isRetryableCode(code: AiErrorCode | undefined): boolean {
  if (code === undefined) return true;
  return RETRYABLE_CODES.has(code);
}

function readString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}

function readNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  return typeof v === "number" ? v : undefined;
}

/**
 * Classify any thrown value into a single `AiErrorCode` + retryability. Never
 * throws; unrecognized errors fall through to `UNKNOWN` (retryable).
 */
export function classifyAiError(err: unknown): ClassifiedAiError {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Something went wrong";

  const retryAfter = getRetryAfterMs(err);
  const retryAfterMs = retryAfter !== null ? retryAfter : undefined;

  const obj =
    err && typeof err === "object" ? (err as Record<string, unknown>) : null;

  // Recognize the app's existing ad-hoc error-code constants first — these are
  // positively-identified permanent failures.
  const explicitCode = obj ? readString(obj, "code") : undefined;
  if (explicitCode === AI_NOT_CONFIGURED_ERROR_CODE) {
    return { code: "AI_NOT_CONFIGURED", message, retryable: false };
  }
  if (explicitCode === QUOTA_EXCEEDED_ERROR_CODE) {
    return { code: "QUOTA_EXCEEDED", message, retryable: false };
  }
  if (explicitCode === MULTIMODAL_ERROR_CODES.AUDIO_INPUT_CAPABILITY_MISMATCH) {
    return { code: "CAPABILITY_MISMATCH", message, retryable: false };
  }
  if (explicitCode === INTEGRITY_ACCESS_REVOKED_ERROR_CODE) {
    return { code: "INTEGRITY_REVOKED", message, retryable: false };
  }

  // Network errors (fetch) surface as TypeError, often without a status code.
  if (err instanceof TypeError) {
    return { code: "NETWORK", message, retryable: true, ...(retryAfterMs ? { retryAfterMs } : {}) };
  }

  // Abort/timeout signals.
  if (
    (err instanceof Error && err.name === "TimeoutError") ||
    (obj && readString(obj, "name") === "TimeoutError")
  ) {
    return { code: "TIMEOUT", message, retryable: true };
  }

  const statusCode = obj
    ? readNumber(obj, "statusCode") ?? readNumber(obj, "status")
    : undefined;

  if (statusCode === 429) {
    return {
      code: "RATE_LIMITED",
      message,
      retryable: true,
      ...(retryAfterMs ? { retryAfterMs } : {}),
    };
  }
  if (statusCode === 503) {
    return {
      code: "PROVIDER_UNAVAILABLE",
      message,
      retryable: true,
      ...(retryAfterMs ? { retryAfterMs } : {}),
    };
  }
  if (statusCode === 400 || statusCode === 422) {
    return { code: "BAD_REQUEST", message, retryable: false };
  }

  return { code: "UNKNOWN", message, retryable: true };
}
