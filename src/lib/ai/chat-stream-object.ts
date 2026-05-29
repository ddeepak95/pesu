/**
 * Multimodal turn streaming via `streamObject`.
 *
 * Replaces the `streamText` + end_conversation-tool approach for the multimodal
 * route. A single call produces a structured object:
 *
 *   { speech, action, endConversation }
 *
 * `speech` is the first field so it streams to TTS immediately; `action`
 * resolves later in the same generation and is dispatched to a content agent in
 * parallel with ongoing speech; `endConversation` replaces the old tool call.
 *
 * The route iterates `partialObjectStream`, diffing `partial.speech` for TTS and
 * acting on `partial.action` / `partial.endConversation` once they resolve.
 */

import { streamObject } from "ai";
import { z } from "zod";
import type { LanguageModelV3, SharedV3ProviderOptions } from "@ai-sdk/provider";

import {
  buildActionSchemaField,
  buildActionsDirective,
} from "@/lib/multimodal/actions/registry";
import type { ActionKind } from "@/lib/multimodal/actions/types";
import type { EndConversationConfig } from "@/lib/multimodal/turnConfig";

export const TURN_SCHEMA_NAME = "multimodal_turn";

const endConversationField = z
  .enum(["thorough", "refusal"])
  .nullable()
  .describe(
    "Set to 'thorough' when the end condition is met, 'refusal' if the learner " +
      "is off-topic or refuses, otherwise null.",
  );

const speechField = z
  .string()
  .describe(
    "The full conversational response to speak aloud. Complete sentences only — " +
      "this is read by a text-to-speech engine.",
  );

/**
 * Build the turn schema. The `action` field is an actionable union of the
 * enabled + implemented action kinds (from the action registry); otherwise it
 * is forced to null so the model never invents an action.
 */
export function buildTurnSchema(availableActions: ActionKind[]) {
  return z.object({
    speech: speechField,
    action: buildActionSchemaField(availableActions),
    endConversation: endConversationField,
  });
}

export type TurnSchema = ReturnType<typeof buildTurnSchema>;

/** Directives appended to the system prompt describing actions + end condition. */
export function buildMultimodalDirectives(input: {
  availableActions: ActionKind[];
  endConversation?: EndConversationConfig;
}): string {
  const lines: string[] = ["", "[Multimodal turn instructions]"];
  lines.push(
    "Respond with a JSON object. The `speech` field is what you say aloud, so " +
      "it is converted to speech: use complete, natural, conversational sentences " +
      "with no markdown, code, or special formatting characters. Keep responses " +
      "reasonably concise — a few sentences at a time, favoring back-and-forth " +
      "over long monologues.",
  );
  lines.push(
    "SAFETY: The users are students. Never output anything offensive, " +
      "inappropriate, or sexual. Always maintain a supportive, age-appropriate tone.",
  );

  // Per-action guidance (or the "always null" fallback) from the registry.
  lines.push(buildActionsDirective(input.availableActions));

  // Ending behavior. The default (thorough completion / refusal) always
  // applies; the teacher's custom guidance, if any, only adds to it.
  const endLine =
    'End the conversation by setting `endConversation`: use "thorough" once the ' +
    "learner has engaged with and reasonably covered the topic, and \"refusal\" if " +
    "the learner is off-topic or refuses to engage. Otherwise keep it null. When " +
    "you set it, make your `speech` a warm closing message.";
  const custom = input.endConversation?.customInstruction?.trim();
  lines.push(
    custom ? `${endLine} Additional guidance on when to wrap up: ${custom}` : endLine,
  );

  return lines.join("\n");
}

export interface MultimodalTurnStreamOptions {
  model: LanguageModelV3;
  systemPrompt: string;
  greeting?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  providerOptions?: SharedV3ProviderOptions;
  availableActions: ActionKind[];
  endConversation?: EndConversationConfig;
}

export interface ResolvedMultimodalTurnCall {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  schema: TurnSchema;
  providerOptions?: SharedV3ProviderOptions;
}

/** Resolve the exact system/messages/schema for a turn (also used for audit logging). */
export function resolveMultimodalTurnCall(
  options: Omit<MultimodalTurnStreamOptions, "model">,
): ResolvedMultimodalTurnCall {
  const { systemPrompt, greeting, messages, providerOptions, availableActions } =
    options;

  let system =
    systemPrompt +
    buildMultimodalDirectives({
      availableActions,
      endConversation: options.endConversation,
    });

  if (greeting && messages.length === 0) {
    system += `\n\n[Instructions for your first response]: ${greeting}`;
  }

  const sdkMessages =
    messages.length > 0
      ? messages
      : [{ role: "user" as const, content: "Begin." }];

  return {
    system,
    messages: sdkMessages,
    schema: buildTurnSchema(availableActions),
    providerOptions,
  };
}

/**
 * Start a multimodal turn stream. Returns the streamObject result whose
 * `.partialObjectStream` the caller iterates to emit SSE events.
 */
export function createMultimodalTurnStream(options: MultimodalTurnStreamOptions) {
  const { model } = options;
  const call = resolveMultimodalTurnCall(options);

  return streamObject({
    model,
    system: call.system,
    messages: call.messages,
    schema: call.schema,
    schemaName: TURN_SCHEMA_NAME,
    providerOptions: call.providerOptions,
    onError({ error }) {
      console.error("[chat-stream-object] streamObject error:", error);
    },
  });
}
