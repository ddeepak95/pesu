/**
 * System-prompt directive units for a multimodal turn.
 *
 * Each turn-schema field (see chat-stream-object.ts) has a matching directive
 * here. Static ones are module constants; conditional ones are pure builders.
 * `buildMultimodalDirectives` composes them. The base system prompt conducts the
 * conversation in the primary language; these are appended on top.
 *
 * Kept separate from chat-stream-object.ts so the "what the prompt says" layer
 * is independent of the "how the turn streams" (schema + streamObject) layer.
 */

import { buildActionsDirective } from "@/lib/multimodal/actions/registry";
import type { ActionKind } from "@/lib/multimodal/actions/types";
import type { EndConversationConfig } from "@/lib/multimodal/turnConfig";
import { getActivityTypeDefinition } from "@/lib/activityTypes/registry";
import type { ActivityTypeKind } from "@/lib/activityTypes/types";

/**
 * Shared by every TTS-bound text generator: write the conversation language in
 * its own native script, never romanized — even when the line is code-mixed
 * with borrowed words from another language (which keep their own script). This
 * keeps the text the TTS engine reads in the script its voice expects.
 *
 * Example (Tamil conversation): எனக்கு ஒரு ice cream வேண்டும். — the Tamil stays
 * in Tamil script (not "enakku oru ... vேண்டும்"), while the borrowed English
 * "ice cream" stays in Latin script rather than being transliterated.
 */
export const SPEECH_SCRIPT_DIRECTIVE =
  "Always write the conversation-language words in that language's own native " +
  "script — never romanize them — even when the line is code-mixed. Borrowed " +
  "words from another language keep their own script (do not transliterate " +
  "them). For example, in a Tamil conversation: எனக்கு ஒரு ice cream வேண்டும்.";

/** Always-on: how to format the spoken `speech` field. */
export const SPEECH_FORMAT_DIRECTIVE =
  "Respond with a JSON object. The `speech` field is what you say aloud, so " +
  "it is converted to speech: use complete, natural, conversational sentences " +
  "with no markdown, code, or special formatting characters. " +
  SPEECH_SCRIPT_DIRECTIVE +
  " Keep responses reasonably concise — a few sentences at a time, favoring " +
  "back-and-forth over long monologues.";

/** Always-on safety guidance. */
export const SAFETY_DIRECTIVE =
  "SAFETY: The users are students. Never output anything offensive, " +
  "inappropriate, or sexual. Always maintain a supportive, age-appropriate tone.";

/**
 * When + how to end the conversation via the `endConversation` field. The
 * default (thorough completion / refusal) always applies; the teacher's custom
 * guidance, if any, only adds to it.
 */
export function buildEndConversationDirective(config?: EndConversationConfig): string {
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
 * Language-support guidance. Returns null when no support language is configured
 * (or the activity type suppresses it). The single always-on directive lets the
 * model reply inline in the support language when the learner asks — TTS always
 * renders in the primary voice, so no separate turn or voice switch is needed.
 */
export function buildLanguageSupportDirective(input: {
  languageHelpAvailable?: { languageLabel: string };
  activityType?: ActivityTypeKind;
}): string | null {
  if (!input.languageHelpAvailable) return null;

  const label = input.languageHelpAvailable.languageLabel;

  // Activity-type override (e.g. speaking practice stays in character and
  // continues the role-play in the support language when the learner asks).
  if (input.activityType) {
    const override = getActivityTypeDefinition(
      input.activityType,
    ).buildLanguageSupportDirective?.({ languageLabel: label });
    if (override === null) return null; // activity type suppresses help entirely
    if (override !== undefined) return override;
  }

  return (
    `LANGUAGE SUPPORT AVAILABLE: A ${label} support channel is available for this learner. ` +
    `When — and only when — (a) the learner explicitly asks to hear something in ${label}, ` +
    `requests a translation, or asks you to explain something in ${label}, or (b) the learner ` +
    `speaks in ${label} (rather than the primary language) seeking help or clarification: ` +
    `reply for that one turn directly in ${label}, in its native script — no primary-language ` +
    `preamble. Keep technical and academic terms in their original language exactly as they ` +
    `appeared. If the learner asks a doubt or question in the primary language, answer it ` +
    `normally in the primary language. Resume the conversation in the primary language on the ` +
    `next turn.`
  );
}

/**
 * Directives appended to the system prompt: speech format, safety, actions,
 * ending, and language support. Composes the directive units above.
 */
export function buildMultimodalDirectives(input: {
  availableActions: ActionKind[];
  endConversation?: EndConversationConfig;
  /**
   * A support language is configured for this learner. Lets the model reply
   * inline in `languageLabel` when the learner asks for help.
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
