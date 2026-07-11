import type { ActionKind, ActionPayload } from "@/lib/multimodal/actions/types";
import type { ActionInput } from "@/lib/multimodal/actions/schema";
import type { AiErrorCode } from "@/lib/ai/errors";

/**
 * Client-side classified-error shape carried on failed chat turns and actions.
 * Mirrors the retryable subset of the server's ClassifiedAiError.
 */
export interface ChatTurnError {
  code: AiErrorCode;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
}

/**
 * Client-side view of an action attached to an assistant message.
 * `loading` while the content agent generates, `ready` once the payload
 * arrives, `error` if generation failed (card stays visible in an error
 * state, with a Retry button — no longer silently dropped).
 */
export interface PendingAction {
  id: string;
  kind: ActionKind;
  state: "loading" | "ready" | "error";
  payload?: ActionPayload;
  /** MCQ: index the learner selected; locks the card once set. */
  answeredIndex?: number;
  /** The action's generation input, echoed from the action_start SSE, so an
   *  error-state card can retry generation via /api/multimodal/action-retry. */
  input?: ActionInput;
  /** The owning assistant chat_messages id (from action_start), needed to retry. */
  chatMessageId?: string;
  /** Present when state === "error": the classified failure for the retry UI. */
  error?: ChatTurnError;
}
