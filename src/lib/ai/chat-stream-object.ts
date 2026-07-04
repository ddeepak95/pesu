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

import { buildActionSchemaField } from "@/lib/multimodal/actions/registry";
import type { ActionKind } from "@/lib/multimodal/actions/types";
import type { EndConversationConfig } from "@/lib/multimodal/turnConfig";
import type { ActivityTypeKind } from "@/lib/activityTypes/types";
import { buildMultimodalDirectives } from "./multimodal-directives";

export const TURN_SCHEMA_NAME = "multimodal_turn";

const endConversationField = z
  .boolean()
  .describe(
    "Whether to end the conversation now, per the guidance in the system prompt. " +
      "When true, make your `speech` a warm closing message.",
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
 *
 * When `dualTranscript` is true, a `userTranscript` field is prepended as the
 * FIRST field so it resolves early in the stream — the model writes the chosen
 * reading before generating speech. When false/absent, the field is omitted.
 */
export function buildTurnSchema(
  availableActions: ActionKind[],
  dualTranscript?: boolean,
) {
  const base = {
    speech: speechField,
    action: buildActionSchemaField(availableActions),
    endConversation: endConversationField,
  };

  if (dualTranscript) {
    return z.object({
      userTranscript: z
        .string()
        .describe(
          "The learner's utterance as you understood it. Identify which of the two " +
            "STT readings you were given is coherent, then copy that reading verbatim " +
            "into this field — with zero edits. Do not fix, correct, normalize, or " +
            "otherwise alter it in any way, even if it looks like an obvious mistake. " +
            "This field MUST be the transcript you respond to.",
        ),
      ...base,
    });
  }
  return z.object(base);
}

export type TurnSchema = ReturnType<typeof buildTurnSchema>;

export interface MultimodalTurnStreamOptions {
  model: LanguageModelV3;
  systemPrompt: string;
  greeting?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  providerOptions?: SharedV3ProviderOptions;
  availableActions: ActionKind[];
  endConversation?: EndConversationConfig;
  languageHelpAvailable?: { languageLabel: string };
  /** Primary conversation language label, for the language-support directive's {{language}} placeholder. */
  primaryLanguageLabel?: string;
  activityType?: ActivityTypeKind;
  /**
   * The assignment's own resolved template definition snapshot, when
   * available — preferred over the kind-registry for the directive fields
   * (`endConditionInstruction`, `actionGuidance`, `languageSupportDirective`).
   * See `resolveActivityDefinitionForRuntime`.
   */
  activityDefinitionSnapshot?: unknown | null;
  /** Present when the latest user message contains two transcript candidates. */
  dualTranscript?: { primaryLabel: string; supportLabel: string };
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
      languageHelpAvailable: options.languageHelpAvailable,
      primaryLanguageLabel: options.primaryLanguageLabel,
      activityType: options.activityType,
      activityDefinitionSnapshot: options.activityDefinitionSnapshot,
      dualTranscript: options.dualTranscript,
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
    schema: buildTurnSchema(availableActions, Boolean(options.dualTranscript)),
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
