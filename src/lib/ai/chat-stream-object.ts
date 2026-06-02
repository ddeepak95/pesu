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
import { getActivityTypeDefinition } from "@/lib/activityTypes/registry";
import type { ActivityTypeKind } from "@/lib/activityTypes/types";

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

const requestLanguageHelpField = z
  .boolean()
  .nullable()
  .describe(
    "Set to true ONLY when the learner explicitly wants a response in the support language: " +
      "they asked you to translate, explain, or speak in the support language, OR they spoke " +
      "in the support language seeking help or clarification. When true, set `speech` to an " +
      "EMPTY STRING — the full response in the support language follows automatically. " +
      "Do NOT set this for questions or doubts asked in the primary language — answer those " +
      "normally in the primary language. Otherwise null.",
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
  languageHelpAvailable?: boolean,
  dualTranscript?: boolean,
) {
  const base = {
    speech: speechField,
    action: buildActionSchemaField(availableActions),
    endConversation: endConversationField,
    // Forced null unless support is available, mirroring the action field —
    // so the model never raises a language-help request when it can't be served.
    requestLanguageHelp: languageHelpAvailable
      ? requestLanguageHelpField
      : z.null(),
  };

  if (dualTranscript) {
    return z.object({
      userTranscript: z
        .string()
        .describe(
          "The learner's utterance as you understood it. Copy the coherent " +
            "reading verbatim (fixing only obvious STT mis-recognitions). " +
            "This field MUST be the transcript you respond to.",
        ),
      ...base,
    });
  }
  return z.object(base);
}

export type TurnSchema = ReturnType<typeof buildTurnSchema>;

/** Per-turn language-support instruction (the learner asked for help in another language). */
export interface TurnLanguageSupport {
  /** This turn's speech restates the previous point in the support language. */
  active: boolean;
  /** Human-readable support language name, e.g. "Tamil". */
  languageLabel: string;
  /** Human-readable primary/conversation language name, e.g. "English". */
  primaryLanguageLabel?: string;
}

// ── System-prompt directive units ──────────────────────────────────────────
// Each turn-schema field has a matching directive. Static ones are module
// constants; conditional ones are pure builders. `buildMultimodalDirectives`
// composes them. The base system prompt conducts the conversation in the
// primary language; these are appended on top.

/** Always-on: how to format the spoken `speech` field. */
const SPEECH_FORMAT_DIRECTIVE =
  "Respond with a JSON object. The `speech` field is what you say aloud, so " +
  "it is converted to speech: use complete, natural, conversational sentences " +
  "with no markdown, code, or special formatting characters. Keep responses " +
  "reasonably concise — a few sentences at a time, favoring back-and-forth " +
  "over long monologues.";

/** Always-on safety guidance. */
const SAFETY_DIRECTIVE =
  "SAFETY: The users are students. Never output anything offensive, " +
  "inappropriate, or sexual. Always maintain a supportive, age-appropriate tone.";

/**
 * When + how to end the conversation via the `endConversation` field. The
 * default (thorough completion / refusal) always applies; the teacher's custom
 * guidance, if any, only adds to it.
 */
function buildEndConversationDirective(config?: EndConversationConfig): string {
  const base =
    'End the conversation by setting `endConversation`: use "thorough" once the ' +
    "learner has engaged with and reasonably covered the topic, and \"refusal\" if " +
    "the learner is off-topic or refuses to engage. Otherwise keep it null. When " +
    "you set it, make your `speech` a warm closing message.";
  const custom = config?.customInstruction?.trim();
  return custom
    ? `${base} Additional guidance on when to wrap up: ${custom}`
    : base;
}

/**
 * Language-support guidance. Returns null when support is neither active nor
 * available this turn. These instructions add the support-language behavior on
 * top of the primary-language base prompt (no need to contradict it).
 */
function buildLanguageSupportDirective(input: {
  languageSupport?: TurnLanguageSupport;
  languageHelpAvailable?: { languageLabel: string };
  activityType?: ActivityTypeKind;
}): string | null {
  // Active: this turn TRANSLATES your previous message into the support language
  // (its TTS voice is already set to match) — a precursor + faithful translation,
  // nothing new.
  if (input.languageSupport?.active) {
    const { languageLabel: label, primaryLanguageLabel: primaryLabel } =
      input.languageSupport;

    // Activity-type override (e.g. speaking practice continues the role-play in
    // the support language rather than giving a literal translation).
    if (input.activityType) {
      const override = getActivityTypeDefinition(
        input.activityType,
      ).buildLanguageSupportActiveDirective?.({
        languageLabel: label,
        primaryLanguageLabel: primaryLabel,
      });
      if (override) return override;
    }

    const termClause = primaryLabel
      ? ` Keep technical and academic terms in ${primaryLabel} exactly as they appeared — ` +
        `translate only the surrounding wording into ${label}.`
      : ` Keep technical and academic terms in their original language exactly as they appeared — ` +
        `translate only the surrounding wording into ${label}.`;
    const line =
      `LANGUAGE SUPPORT — RESPOND IN ${label.toUpperCase()}: The learner needs a response in ` +
      `${label}. For this one response, speak entirely and directly in ${label} — no preamble, ` +
      `no primary-language intro. If they asked for a translation: give a faithful, complete ` +
      `translation of your previous message into ${label}. If they asked a clarifying question ` +
      `or expressed confusion: answer or explain directly in ${label}.` +
      termClause +
      ` Resume the conversation in the usual language on the next turn.`;
    return line;
  }

  // Available: this turn is in the primary language, but the model may switch to
  // the support language when the learner explicitly requests it.
  if (input.languageHelpAvailable) {
    const label = input.languageHelpAvailable.languageLabel;
    return (
      `LANGUAGE SUPPORT AVAILABLE: A ${label} support channel is available for this learner. ` +
      `Set \`requestLanguageHelp\` to true — and set \`speech\` to EMPTY STRING — only when: ` +
      `(a) the learner explicitly asks to hear something in ${label}, requests a translation, ` +
      `or asks you to explain something in ${label}, or ` +
      `(b) the learner speaks in ${label} (rather than the primary language) seeking help or ` +
      `clarification. ` +
      `A full ${label} response will follow automatically — do NOT say anything in the primary ` +
      `language first; leave \`speech\` completely empty. ` +
      `If the learner asks a doubt or question in the primary language, answer it normally in ` +
      `the primary language — do NOT set \`requestLanguageHelp\`. ` +
      `Otherwise leave \`requestLanguageHelp\` null and continue normally.`
    );
  }

  return null;
}

/**
 * Directives appended to the system prompt: speech format, safety, actions,
 * ending, and language support. Composes the directive units above.
 */
export function buildMultimodalDirectives(input: {
  availableActions: ActionKind[];
  endConversation?: EndConversationConfig;
  languageSupport?: TurnLanguageSupport;
  /**
   * Support is available (but this turn is spoken in the normal language). Lets
   * the model offer help in `languageLabel` by setting `requestLanguageHelp`.
   */
  languageHelpAvailable?: { languageLabel: string };
  /** Activity type — may contribute an extra directive (e.g. speaking practice). */
  activityType?: ActivityTypeKind;
  /**
   * When set, the learner's audio was transcribed in two languages simultaneously.
   * The model must pick the coherent reading and write it to `userTranscript`.
   */
  dualTranscript?: { primaryLabel: string; supportLabel: string };
}): string {
  const lines: string[] = [
    "",
    "[Multimodal turn instructions]",
    SPEECH_FORMAT_DIRECTIVE,
    SAFETY_DIRECTIVE,
    buildActionsDirective(input.availableActions),
    buildEndConversationDirective(input.endConversation),
  ];

  if (input.activityType) {
    const activityDirective = getActivityTypeDefinition(
      input.activityType,
    ).buildMultimodalDirective?.();
    if (activityDirective) lines.push(activityDirective);
  }

  const languageDirective = buildLanguageSupportDirective({
    languageSupport: input.languageSupport,
    languageHelpAvailable: input.languageHelpAvailable,
    activityType: input.activityType,
  });
  if (languageDirective) lines.push(languageDirective);

  if (input.dualTranscript) {
    const { primaryLabel, supportLabel } = input.dualTranscript;
    lines.push(
      `DUAL TRANSCRIPT: The learner's audio was transcribed in two languages simultaneously ` +
        `(${primaryLabel} and ${supportLabel}). The message you receive contains both readings. ` +
        `Exactly one is coherent and correct — the other is garbled output from the wrong language ` +
        `model. Identify the coherent reading, copy it verbatim into \`userTranscript\` (fixing ` +
        `only obvious mis-recognitions), and respond to it. Ignore the garbled reading entirely.`,
    );
  }

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
  languageSupport?: TurnLanguageSupport;
  languageHelpAvailable?: { languageLabel: string };
  activityType?: ActivityTypeKind;
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
      endConversation: options.endConversation,
      languageSupport: options.languageSupport,
      languageHelpAvailable: options.languageHelpAvailable,
      activityType: options.activityType,
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
    schema: buildTurnSchema(
      availableActions,
      Boolean(options.languageHelpAvailable),
      Boolean(options.dualTranscript),
    ),
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
