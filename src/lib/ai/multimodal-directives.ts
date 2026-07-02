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

import { buildActionsDirective, getActionDefinition } from "@/lib/multimodal/actions/registry";
import type { ActionKind } from "@/lib/multimodal/actions/types";
import { resolveActivityTemplate } from "@/lib/activityTypes/templateResolver";
import type { ActivityTypeKind } from "@/lib/activityTypes/types";
import { SAFETY_DIRECTIVE } from "./safetyDirective";

/** Re-exported for backward compatibility with existing importers (e.g. the Platform Templates preview). */
export { SAFETY_DIRECTIVE };

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

/**
 * When + how to end the conversation via the boolean `endConversation` field.
 * The base rule always applies; an activity type's own `endConditionInstruction`
 * (if set) layers on top under a single "When to end:" heading.
 */
export function buildEndConversationDirective(input: {
  /** Activity-type-level guidance on when to end (`endConditionInstruction`). */
  endConditionInstruction?: string;
}): string {
  const base =
    "To end the conversation, set `endConversation` to true (false otherwise). When you " +
    "set it to true, make your `speech` a warm closing message.";
  const guidance = input.endConditionInstruction?.trim();
  return guidance ? `${base}\n\nWhen to end: ${guidance}` : base;
}

/** Default "language support available" directive text, with a {{support_language}} placeholder. */
const DEFAULT_LANGUAGE_SUPPORT_DIRECTIVE =
  "LANGUAGE SUPPORT AVAILABLE: A {{support_language}} support channel is available for this learner. " +
  "When — and only when — (a) the learner explicitly asks to hear something in {{support_language}}, " +
  "requests a translation, or asks you to explain something in {{support_language}}, or (b) the learner " +
  "speaks in {{support_language}} (rather than the primary language) seeking help or clarification: " +
  "reply for that one turn directly in {{support_language}}, in its native script — no primary-language " +
  "preamble. Keep technical and academic terms in their original language exactly as they " +
  "appeared. If the learner asks a doubt or question in the primary language, answer it " +
  "normally in the primary language. Resume the conversation in the primary language on the " +
  "next turn.";

/**
 * Language-support guidance. Returns null when no support language is configured.
 * The single always-on directive lets the model reply inline in the support
 * language when the learner asks — TTS always renders in the primary voice, so
 * no separate turn or voice switch is needed. An activity type may fully
 * replace this text via `languageSupportDirective` (e.g. Speaking Practice
 * stays in character instead of translating). Supports both {{support_language}}
 * and {{language}} placeholders (the primary conversation language).
 */
export function buildLanguageSupportDirective(input: {
  languageHelpAvailable?: { languageLabel: string };
  /** Primary conversation language label, substituted for {{language}}. */
  primaryLanguageLabel?: string;
  activityType?: ActivityTypeKind;
}): string | null {
  if (!input.languageHelpAvailable) return null;

  const label = input.languageHelpAvailable.languageLabel;
  const template =
    (input.activityType &&
      resolveActivityTemplate({ kind: input.activityType }).definition
        .languageSupportDirective) ||
    DEFAULT_LANGUAGE_SUPPORT_DIRECTIVE;

  return template
    .replaceAll("{{support_language}}", label)
    .replaceAll("{{language}}", input.primaryLanguageLabel ?? "{{language}}");
}

/**
 * Resolves {{action:kind}} placeholders in directive text against the action
 * registry's live display label, so template authors don't have to hardcode a
 * raw action kind name that could drift if the action is ever relabeled.
 * Unresolvable kinds are left as-is (visible) rather than silently dropped.
 */
function substituteActionReferences(text: string): string {
  return text.replace(/\{\{action:([a-zA-Z0-9_]+)\}\}/g, (match, kind) => {
    try {
      return getActionDefinition(kind as ActionKind).label;
    } catch {
      return match;
    }
  });
}

/**
 * Directives appended to the system prompt: speech format, safety, actions,
 * ending, and language support. Composes the directive units above.
 */
export function buildMultimodalDirectives(input: {
  availableActions: ActionKind[];
  /**
   * A support language is configured for this learner. Lets the model reply
   * inline in `languageLabel` when the learner asks for help.
   */
  languageHelpAvailable?: { languageLabel: string };
  /** Primary conversation language label, for the language-support directive's {{language}} placeholder. */
  primaryLanguageLabel?: string;
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
    buildEndConversationDirective({
      endConditionInstruction: input.activityType
        ? resolveActivityTemplate({ kind: input.activityType }).definition
            .endConditionInstruction
        : undefined,
    }),
  ];

  if (input.activityType) {
    const actionDirective = resolveActivityTemplate({
      kind: input.activityType,
    }).definition.actionDirective;
    if (actionDirective) lines.push(substituteActionReferences(actionDirective));
  }

  const languageDirective = buildLanguageSupportDirective({
    languageHelpAvailable: input.languageHelpAvailable,
    primaryLanguageLabel: input.primaryLanguageLabel,
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
