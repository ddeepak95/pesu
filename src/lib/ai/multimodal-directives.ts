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

import {
  filterImplemented,
  getActionDefinition,
} from "@/lib/multimodal/actions/registry";
import type { ActionKind } from "@/lib/multimodal/actions/types";
import { resolveActivityDefinitionForRuntime } from "@/lib/activityTypes/templateResolver";
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
  "Write each language you speak in its own native script — never romanized, " +
  "even when code-mixed with borrowed words (e.g. Tamil: எனக்கு ஒரு ice cream " +
  "வேண்டும்).";

/** Always-on: how to format the spoken `speech` field. */
export const SPEECH_FORMAT_DIRECTIVE =
  "Respond with a JSON object. `speech` is converted to audio: natural, " +
  "conversational sentences, no markdown/code/special characters. " +
  SPEECH_SCRIPT_DIRECTIVE +
  " Keep it concise — a few words at a time, favoring back-and-forth over " +
  "monologue.";

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
  return guidance ? `**\n${base} Condition for ending the conversation: ${guidance}` : base;
}

/** Default "language support available" directive text, with a {{support_language}} placeholder. */
const DEFAULT_LANGUAGE_SUPPORT_DIRECTIVE =
  "LANGUAGE SUPPORT: {{support_language}} help is available. If the learner asks for it or " +
  "speaks in {{support_language}}, reply that one turn in {{support_language}} (technical " +
  "terms unchanged); otherwise always use {{language}}.";

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
  /** Resolved definition's own override, if any — already snapshot/registry-resolved by the caller. */
  languageSupportDirective?: string;
}): string | null {
  if (!input.languageHelpAvailable) return null;

  const label = input.languageHelpAvailable.languageLabel;
  const template = input.languageSupportDirective || DEFAULT_LANGUAGE_SUPPORT_DIRECTIVE;

  return template
    .replaceAll("{{support_language}}", label)
    .replaceAll("{{language}}", input.primaryLanguageLabel ?? "{{language}}");
}

/**
 * Per-action instructions: each enabled+implemented action's own *mechanics*
 * (schema fields, always-on for any type — `buildDirective()`) immediately
 * followed by that action's own *guidance* — hand-written pedagogy authored
 * per (activity type, action) on the type itself
 * (`ActivityTypeDefinition.actionGuidance`), e.g. "use MCQ sparingly" for one
 * type vs. "hint on wrong answers" for another, auto-prefixed with the
 * action's own live display label so authored text never needs to name the
 * action itself. Kept paired per action (rather than all actions' mechanics
 * in one block and all actions' guidance in a separate block elsewhere in the
 * prompt) so the model reads "how to use X" and "when to use X" together.
 */
function buildActionsAndGuidanceDirective(
  enabledKinds: ActionKind[],
  actionGuidance: Partial<Record<ActionKind, string>> | undefined,
): string {
  const enabled = filterImplemented(enabledKinds);
  if (enabled.length === 0) {
    return "Always set `action` to null.";
  }
  return enabled
    .map((k) => {
      const def = getActionDefinition(k);
      const guidanceText = actionGuidance?.[k];
      return [def.buildDirective(), guidanceText ? `${"Additional guidance"}: ${guidanceText}` : ""]
        .filter(Boolean)
        .join(" ");
    })
    .filter(Boolean)
    .join("\n--\n");
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
   * The assignment's own resolved template definition (labels, generation
   * copy, directive fields). Preferred over the kind-registry when present
   * and valid; falls back to the registry default for legacy/missing/
   * malformed snapshots. See `resolveActivityDefinitionForRuntime`.
   */
  activityDefinitionSnapshot?: unknown | null;
  /**
   * When set, the learner's audio was transcribed in two languages simultaneously.
   * The model must pick the coherent reading and write it to `userTranscript`.
   */
  dualTranscript?: { primaryLabel: string; supportLabel: string };
}): string {
  const resolvedDefinition = input.activityType
    ? resolveActivityDefinitionForRuntime(input.activityType, input.activityDefinitionSnapshot)
    : undefined;

  const lines: string[] = [
    "",
    "[Multimodal turn instructions]",
    SPEECH_FORMAT_DIRECTIVE, "**",
    SAFETY_DIRECTIVE, "**",
    "You can use the following actions to make the conversation more engaging:\n----",
    buildActionsAndGuidanceDirective(
      input.availableActions,
      resolvedDefinition?.actionGuidance,
    ),
    "**",
  ];

  const languageDirective = buildLanguageSupportDirective({
    languageHelpAvailable: input.languageHelpAvailable,
    primaryLanguageLabel: input.primaryLanguageLabel,
    languageSupportDirective: resolvedDefinition?.languageSupportDirective,
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

  // End-conversation instructions go last — they're the final decision the
  // model makes each turn, so keeping them closest to the actual output
  // fields (right before the schema takes over) keeps them top-of-mind.
  lines.push(
    buildEndConversationDirective({
      endConditionInstruction: resolvedDefinition?.endConditionInstruction,
    }),
  );

  return lines.join("\n");
}
