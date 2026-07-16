/**
 * Plain-language, learner-facing text for each AI error code. The raw provider
 * message (e.g. "429 quota exceeded for model …") is useful in logs but confusing
 * on screen — the UI shows these instead. Client-safe: imports only the type.
 * See dev-docs/ai-retry-and-failure-recovery-plan.md §9.
 */

import type { AiErrorCode } from "./errors";

/** Short headline shown as the primary error line. */
const USER_FACING_MESSAGES: Record<AiErrorCode, string> = {
  RATE_LIMITED: "The AI is busy right now.",
  PROVIDER_UNAVAILABLE: "The AI service is temporarily unavailable.",
  NETWORK: "We couldn’t reach the server.",
  TIMEOUT: "That took too long to respond.",
  AI_NOT_CONFIGURED: "This activity’s AI isn’t set up yet.",
  QUOTA_EXCEEDED: "This class is out of AI credits.",
  AI_ACCESS_DISABLED: "AI access is currently turned off for this class.",
  CAPABILITY_MISMATCH: "This activity’s AI settings don’t support this step.",
  INTEGRITY_REVOKED: "Your access to this activity has changed.",
  BAD_REQUEST: "Something about that request wasn’t accepted.",
  UNKNOWN: "Something went wrong.",
};

/** Secondary line telling the learner what to do next. */
const USER_FACING_HINTS: Record<AiErrorCode, string> = {
  RATE_LIMITED: "Wait a moment, then try again.",
  PROVIDER_UNAVAILABLE: "Please try again in a moment.",
  NETWORK: "Check your internet connection and try again.",
  TIMEOUT: "Please try again.",
  AI_NOT_CONFIGURED: "Please let your teacher know.",
  QUOTA_EXCEEDED: "Please let your instructor know.",
  AI_ACCESS_DISABLED: "Please let your instructor know.",
  CAPABILITY_MISMATCH: "Please let your teacher know.",
  INTEGRITY_REVOKED: "Refresh the page, or check with your teacher.",
  BAD_REQUEST: "Try again. If it keeps happening, tell your teacher.",
  UNKNOWN: "Please try again.",
};

/** Plain headline for a code (falls back to the generic message). */
export function userFacingAiMessage(code: AiErrorCode | undefined): string {
  return code ? USER_FACING_MESSAGES[code] : USER_FACING_MESSAGES.UNKNOWN;
}

/** Plain "what to do next" hint for a code. */
export function userFacingAiHint(code: AiErrorCode | undefined): string {
  return code ? USER_FACING_HINTS[code] : USER_FACING_HINTS.UNKNOWN;
}

/**
 * Surface-specific framing (retry-button label + any reassurance) that wraps the
 * shared per-code copy above. Keeping it here means ALL learner-facing error text
 * lives in this one file, rather than being split across the feature components.
 */
export const AI_SURFACE_COPY = {
  turn: { retryLabel: "Retry" },
  action: { retryLabel: "Retry" },
  evaluate: {
    retryLabel: "Retry evaluation",
    /** Reassurance prefixed to the hint on retryable evaluation failures. */
    reassurance: "Your answer is saved and nothing was lost.",
  },
} as const;

/**
 * Full "detail" line for a failed evaluation: the reassurance + the hint on
 * retryable failures, or just the hint on permanent ones.
 */
export function evaluateErrorDetail(
  code: AiErrorCode | undefined,
  retryable: boolean,
): string {
  const hint = userFacingAiHint(code);
  return retryable ? `${AI_SURFACE_COPY.evaluate.reassurance} ${hint}` : hint;
}
