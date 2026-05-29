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
import { handleMcqAction } from "./mcq";

export type EnqueueFn = (data: Record<string, unknown>) => void;

export interface DispatchActionArgs {
  /** Unique id correlating action_start → action_payload/action_error. */
  id: string;
  /** The action the model requested this turn. */
  action: ActionInput;
  /** Model + options reused for content generation (same provider as the turn). */
  model: LanguageModelV3;
  providerOptions?: SharedV3ProviderOptions;
  enqueue: EnqueueFn;
  supabase: SupabaseClient;
  submissionId: string | null;
  /** FK to the assistant chat_messages row this action belongs to. */
  chatMessageId: string;
}

export async function dispatchAction(args: DispatchActionArgs): Promise<void> {
  switch (args.action.kind) {
    case "mcq":
      return handleMcqAction({ ...args, action: args.action });
    // case "image": return handleImageAction(args);
    // case "equation": return handleEquationAction(args);
    default:
      throw new Error(
        `Unknown action kind: ${(args.action as { kind: string }).kind}`,
      );
  }
}
