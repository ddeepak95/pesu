/**
 * Action dispatcher — routes a model-requested action to its handler.
 *
 * Handlers run as fire-and-forget Promises spawned by the turn route while the
 * speech is still streaming, so content generation happens in parallel with TTS.
 * Each handler is responsible for persisting its payload (before enqueue) and
 * emitting the `action_payload` SSE event.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { MeteredTextModel } from "@/lib/ai/gateway";
import type { ActionInput } from "./schema";
import { handleDisplayContentAction } from "./display-content";
import { handleMcqAction } from "./mcq";
import { handleSuggestedResponseAction } from "./suggested-response";
import { INTERACTIVE_MAX_ATTEMPTS, withRetry } from "@/lib/ai/retry";
import { classifyAiError } from "@/lib/ai/errors";
import { logAppEvent } from "@/lib/logging/appLog";

export type EnqueueFn = (data: Record<string, unknown>) => void;

export interface DispatchActionArgs {
  /** Unique id correlating action_start → action_payload/action_error. */
  id: string;
  /** The action the model requested this turn. */
  action: ActionInput;
  /**
   * Metered handle for this action's content generation, resolved from the
   * action's own catalog binding (e.g. `text.mcq_generation`). Inherits the
   * chat handle unless an admin overrode that sub-function (§7.1).
   */
  handle: MeteredTextModel;
  enqueue: EnqueueFn;
  supabase: SupabaseClient;
  submissionId: string | null;
  /** FK to the assistant chat_messages row this action belongs to. */
  chatMessageId: string;
  /**
   * Human-readable conversation (primary) language, e.g. "Hindi". Content
   * handlers must author their payload in this language to match the chat.
   */
  languageLabel: string;
  /**
   * Human-readable support language, e.g. "English". Used by handlers that
   * need to generate a translation (e.g. suggested_response).
   */
  supportLanguageLabel?: string;
  /**
   * Recent conversation turns (last few messages), oldest first. Lets handlers
   * understand the conversational context and roles without the full history.
   */
  recentMessages?: Array<{ role: "student" | "assistant"; content: string }>;
  /**
   * Optional scoping context for admin logging (app_logs). Not used by handlers;
   * only for the silent-retry / terminal-failure log rows below.
   */
  classId?: string | null;
  assignmentId?: string | null;
  questionOrder?: number | null;
}

/** Cap on each silent-retry backoff — actions run in parallel with TTS, so a
 *  long Retry-After should not hold the turn's finalize hostage. */
const ACTION_RETRY_DELAY_CAP_MS = 4000;

function runActionHandler(args: DispatchActionArgs): Promise<void> {
  switch (args.action.kind) {
    case "mcq":
      return handleMcqAction({ ...args, action: args.action });
    case "suggested_response":
      return handleSuggestedResponseAction({ ...args, action: args.action });
    case "display_content":
      return handleDisplayContentAction({ ...args, action: args.action });
    // case "image": return handleImageAction(args);
    // case "equation": return handleEquationAction(args);
    default:
      throw new Error(
        `Unknown action kind: ${(args.action as { kind: string }).kind}`,
      );
  }
}

/**
 * Route a model-requested action to its handler with kind-agnostic silent
 * retries. Wrapping here (not per-handler) means every current and future action
 * kind inherits retries automatically; it is safe because action persistence
 * upserts on id, so a re-run is idempotent. Terminal failures and each silent
 * retry are logged to app_logs. On terminal failure the error is re-thrown so
 * the caller can emit action_error. See dev-docs/ai-retry-and-failure-recovery-plan.md §6.
 */
export async function dispatchAction(args: DispatchActionArgs): Promise<void> {
  const kind = args.action.kind;
  try {
    await withRetry(() => runActionHandler(args), {
      maxAttempts: INTERACTIVE_MAX_ATTEMPTS,
      maxDelayMs: ACTION_RETRY_DELAY_CAP_MS,
      onRetryAttempt: (attempt, error) => {
        logAppEvent({
          level: "warn",
          source: "multimodal_action",
          event: "silent_retry",
          errorCode: classifyAiError(error).code,
          message: error instanceof Error ? error.message : undefined,
          classId: args.classId,
          activityId: args.assignmentId,
          submissionId: args.submissionId,
          questionOrder: args.questionOrder,
          metadata: { attempt, kind },
        });
      },
    });
  } catch (err) {
    const classified = classifyAiError(err);
    logAppEvent({
      level: "error",
      source: "multimodal_action",
      event: "ai_failure",
      errorCode: classified.code,
      message: classified.message,
      classId: args.classId,
      activityId: args.assignmentId,
      submissionId: args.submissionId,
      questionOrder: args.questionOrder,
      metadata: { kind },
    });
    throw err;
  }
}
