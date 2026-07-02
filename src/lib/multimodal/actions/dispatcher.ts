/**
 * Action dispatcher — routes a model-requested action to its handler.
 *
 * Handlers run as fire-and-forget Promises spawned by the turn route while the
 * speech is still streaming, so content generation happens in parallel with TTS.
 * Each handler is responsible for persisting its payload (before enqueue) and
 * emitting the `action_payload` SSE event.
 */

import type { LanguageModelV3, SharedV3ProviderOptions } from "@ai-sdk/provider";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ActionInput } from "./schema";
import { handleDisplayContentAction } from "./display-content";
import { handleMcqAction } from "./mcq";
import { handleSuggestedResponseAction } from "./suggested-response";

export type EnqueueFn = (data: Record<string, unknown>) => void;

export interface DispatchActionArgs {
  /** Unique id correlating action_start → action_payload/action_error. */
  id: string;
  /** The action the model requested this turn. */
  action: ActionInput;
  /**
   * Model + options for this action's content generation, resolved from the
   * action's own catalog binding (e.g. `text.mcq_generation`). Inherits the
   * chat model unless an admin overrode that sub-function.
   */
  model: LanguageModelV3;
  providerOptions?: SharedV3ProviderOptions;
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
}

export async function dispatchAction(args: DispatchActionArgs): Promise<void> {
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
