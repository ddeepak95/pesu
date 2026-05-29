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
  actionInputSchema,
  IMPLEMENTED_ACTION_KINDS,
  mcqActionInputSchema,
} from "@/lib/multimodal/actions/schema";
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
 * Build the turn schema. The `action` field is only an actionable union when the
 * teacher has enabled at least one implemented action kind; otherwise it is
 * forced to null so the model never invents an action.
 */
export function buildTurnSchema(availableActions: ActionKind[]) {
  const enabled = availableActions.filter((k) =>
    IMPLEMENTED_ACTION_KINDS.includes(k),
  );

  if (enabled.length === 0) {
    return z.object({
      speech: speechField,
      action: z.null(),
      endConversation: endConversationField,
    });
  }

  // Phase 1: only mcq is implemented, so the union has a single member.
  // As more kinds ship, swap this for a discriminatedUnion filtered by `enabled`.
  const actionField = (
    enabled.includes("mcq") ? mcqActionInputSchema : actionInputSchema
  )
    .nullable()
    .describe("A single content action to show the learner, or null if none needed.");

  return z.object({
    speech: speechField,
    action: actionField,
    endConversation: endConversationField,
  });
}

export type TurnSchema = ReturnType<typeof buildTurnSchema>;

/** Directives appended to the system prompt describing actions + end condition. */
export function buildMultimodalDirectives(input: {
  availableActions: ActionKind[];
  endConversation?: EndConversationConfig;
}): string {
  const enabled = input.availableActions.filter((k) =>
    IMPLEMENTED_ACTION_KINDS.includes(k),
  );

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

  if (enabled.includes("mcq")) {
    lines.push(
      "Actively check the learner's understanding with multiple choice questions. " +
        "After you explain or discuss a discrete concept, attach ONE question via the " +
        "`action` field: set `action.kind` to \"mcq\", `action.topic` to the concept to " +
        "assess, and `action.difficulty` to easy, medium, or hard. In your `speech`, " +
        "briefly tell the learner that a question will appear in the content box on " +
        "their screen for them to answer. Attach at most one action per turn — set " +
        "`action` to null only while you are still explaining or the learner is " +
        "mid-thought — but lean toward posing a question whenever you have just " +
        "covered an idea worth checking.",
    );
    lines.push(
      "When the learner answers, you receive a hidden note with the result, the " +
        "correct answer, and an explanation. If they were WRONG, give a brief spoken " +
        "hint WITHOUT stating the correct answer and re-ask the SAME question by " +
        "setting `action.kind` to \"mcq\" with `action.repeatPrevious` set to true. If " +
        "they were CORRECT, acknowledge it and move on (do not re-ask). If they have " +
        "struggled several times, you may reveal the answer and move on instead of re-asking.",
    );
  } else {
    lines.push("Always set `action` to null.");
  }

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
