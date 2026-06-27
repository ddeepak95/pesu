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

/** Per-turn language-support instruction (the learner asked for help in another language). */
export interface TurnLanguageSupport {
  /** This turn's speech restates the previous point in the support language. */
  active: boolean;
  /** Human-readable support language name, e.g. "Tamil". */
  languageLabel: string;
  /** Human-readable primary/conversation language name, e.g. "English". */
  primaryLanguageLabel?: string;
}

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
 * Language-support guidance. Returns null when support is neither active nor
 * available this turn. These instructions add the support-language behavior on
 * top of the primary-language base prompt (no need to contradict it).
 */
export function buildLanguageSupportDirective(input: {
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

    if (input.activityType) {
      const override = getActivityTypeDefinition(
        input.activityType,
      ).buildLanguageSupportAvailableDirective?.({ languageLabel: label });
      if (override === null) return null; // activity type suppresses help entirely
      if (override !== undefined) return override;
    }

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
 * Returns true when language help should be offered this turn — i.e. support is
 * configured AND the activity type has not suppressed the offer. Used to gate
 * both the `requestLanguageHelp` schema field and the available directive.
 */
export function shouldOfferLanguageHelp(
  languageHelpAvailable: { languageLabel: string } | undefined,
  activityType: ActivityTypeKind | undefined,
): boolean {
  if (!languageHelpAvailable) return false;
  if (!activityType) return true;
  const def = getActivityTypeDefinition(activityType);
  if (!def.buildLanguageSupportAvailableDirective) return true;
  return (
    def.buildLanguageSupportAvailableDirective({
      languageLabel: languageHelpAvailable.languageLabel,
    }) !== null
  );
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
