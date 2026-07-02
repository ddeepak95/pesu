/**
 * Action registry — the single source of truth for multimodal action kinds.
 *
 * Pure / client-safe: no server-only imports (handlers live in their own
 * server modules, wired into the dispatcher). Zod schemas are isomorphic, so
 * this module is safe to import from both the API route and client components
 * (e.g. the teacher toggle UI).
 *
 * To add a new action kind: add an entry here, an input schema in ./schema.ts,
 * a handler + dispatcher mapping, a catalog sub-function + AppFunctionKey, an
 * ActionCard case, and (if it needs a new capability) a ModelTask. See
 * docs/multimodal-orchestration-plan.md → "Modular Action Capabilities".
 */

import { z } from "zod";

import type { AppFunctionKey } from "@/lib/ai/catalog/appFunctions";
import type { ModelTask } from "@/lib/ai/catalog/types";
import type { ActivityTypeKind } from "@/lib/activityTypes/types";

import {
  displayContentActionInputSchema,
  mcqActionInputSchema,
  suggestedResponseActionInputSchema,
} from "./schema";
import type { ActionKind } from "./types";

/**
 * Client-side trigger metadata for actions that can be activated directly by
 * the learner (e.g. via the bulb button), independently of the LLM's own
 * decision to fire an action mid-turn.
 */
export interface ActionClientTrigger {
  /** Hidden message injected into conversation history before the triggered turn. */
  hiddenMessage: string;
  /** When true, the triggered turn skips TTS — the card is the entire response. */
  noSpeech?: boolean;
  /** Activity types where the bulb button should trigger this action. */
  bulbForActivityTypes?: ActivityTypeKind[];
  /** Tooltip shown on the bulb button when this action is the bulb target. */
  bulbTooltip?: string;
  /** Activity types where this action is always prepended to availableActions. */
  autoAvailableForActivityTypes?: ActivityTypeKind[];
}

export interface ActionDefinition {
  kind: ActionKind;
  /** Label shown on the teacher capability toggle. */
  label: string;
  /** Helper text shown under the toggle. */
  description: string;
  /** True once a working handler is registered in the dispatcher. */
  implemented: boolean;
  /** Tasks a model must support to run this action's content generation. */
  requiredTasks: ModelTask[];
  /** Catalog binding that resolves the action's content-generation model. */
  appFunctionKey: AppFunctionKey;
  /** The action *request* schema the orchestrator emits (see ./schema.ts). */
  inputSchema: z.ZodTypeAny;
  /** System-prompt guidance describing when/how the model should use this action. */
  buildDirective: () => string;
  /** Optional metadata for actions the learner can trigger directly from the UI. */
  clientTrigger?: ActionClientTrigger;
}

// One string per paragraph; joined for the orchestrator system prompt. Mechanics
// only (schema fields + the retry protocol tied to `repeatPrevious`) — how often
// to pose a question is a pacing judgment that belongs in each activity type's
// `actionDirective`, not here, so it stays overridable per type.
const MCQ_DIRECTIVE_PARAGRAPHS = [
  // Schema mechanics.
  'To pose a multiple choice question, set `action.kind` to "mcq", `action.topic` to the concept being assessed, and `action.difficulty` to easy, medium, or hard, and briefly tell the learner in your `speech` that a question will appear on their screen.',
  // Answer-delivery mechanics only. What to actually do with a right/wrong
  // answer (hint, reveal, re-ask, stay neutral) is a pedagogical judgment that
  // varies by type (e.g. it directly conflicts with an examiner's "never give
  // away the answer" rule) — that belongs in each activity type's
  // `actionDirective`, not here.
  'When the learner answers, you receive a hidden note with the result, the correct answer, and an explanation. To re-ask the exact same question, set `action.kind` to "mcq" with `action.repeatPrevious` set to true.',
];

const MCQ_DIRECTIVE = MCQ_DIRECTIVE_PARAGRAPHS.join("\n");

/**
 * Only kinds with a real handler/schema appear here. Future kinds
 * (image/video/equation/animation) are added once their handler ships.
 */
export const ACTION_REGISTRY: Partial<Record<ActionKind, ActionDefinition>> = {
  suggested_response: {
    kind: "suggested_response",
    label: "Suggested responses",
    description:
      "Show the learner a sample response they can say, with audio and translation.",
    implemented: true,
    requiredTasks: ["text_generation"],
    appFunctionKey: "text.suggested_response_generation",
    inputSchema: suggestedResponseActionInputSchema,
    buildDirective: () => "",
    clientTrigger: {
      hiddenMessage:
        '[System] Provide a suggested response for your last spoken message. Set action.kind to "suggested_response", ' +
        'action.triggerKind to "reply", and action.botUtterance to your most recent spoken utterance verbatim. Set speech to an empty string.',
      noSpeech: true,
      bulbForActivityTypes: ["speaking_practice"],
      bulbTooltip:
        "Get a suggested response — see a sample phrase you could say, with audio and translation",
    },
  },
  mcq: {
    kind: "mcq",
    label: "Multiple choice questions",
    description: "The tutor can pose an MCQ when it helps the learner.",
    implemented: true,
    requiredTasks: ["text_generation"],
    appFunctionKey: "text.mcq_generation",
    inputSchema: mcqActionInputSchema,
    buildDirective: () => MCQ_DIRECTIVE,
  },
  display_content: {
    kind: "display_content",
    label: "Display content",
    description:
      "The tutor can show a code snippet or formatted content in the content box instead of reading it aloud.",
    implemented: true,
    requiredTasks: ["text_generation"],
    appFunctionKey: "text.display_content",
    inputSchema: displayContentActionInputSchema,
    // Mechanics only — when it's appropriate to use this action is a per-type
    // judgment that belongs in each activity type's `actionDirective`.
    buildDirective: () =>
      "To use the `display_content` action, set `action.kind` to \"display_content\", " +
      "`action.content` to the exact markdown (e.g. a fenced code block), and optionally " +
      "`action.title` to a short label (e.g. the function name). In your `speech`, refer to it " +
      "as 'the code shown on screen' or 'the snippet I've highlighted' — never read code syntax " +
      "or markdown formatting aloud. Do not use it when wrapping up or closing the conversation " +
      "— set `action` to null in those turns.",
    clientTrigger: {
      hiddenMessage: "",
      autoAvailableForActivityTypes: ["code_review"],
    },
  },
};

export function getActionDefinition(kind: ActionKind): ActionDefinition {
  const def = ACTION_REGISTRY[kind];
  if (!def) {
    throw new Error(`No action definition registered for kind: ${kind}`);
  }
  return def;
}

/** Action kinds that currently have a working handler. */
export function listImplementedActions(): ActionDefinition[] {
  return Object.values(ACTION_REGISTRY).filter((a) => a.implemented);
}

/** Action kinds that currently have a working handler (kinds only). */
export const IMPLEMENTED_ACTION_KINDS: readonly ActionKind[] =
  listImplementedActions().map((a) => a.kind);

/** Narrow a requested set of kinds to those that are actually implemented. */
export function filterImplemented(kinds: ActionKind[]): ActionKind[] {
  return kinds.filter((k) => ACTION_REGISTRY[k]?.implemented);
}

/**
 * Build the `action` field schema for the turn. Always nullable. When no
 * implemented action is enabled, it is forced to `null` so the model never
 * invents an action.
 */
export function buildActionSchemaField(enabledKinds: ActionKind[]): z.ZodTypeAny {
  const enabled = filterImplemented(enabledKinds);

  if (enabled.length === 0) {
    return z.null();
  }

  const schemas = enabled.map((k) => getActionDefinition(k).inputSchema);

  const union =
    schemas.length === 1
      ? schemas[0]
      : z.discriminatedUnion(
          "kind",
          schemas as unknown as Parameters<typeof z.discriminatedUnion>[1],
        );

  return union
    .nullable()
    .describe("A single content action to show the learner, or null if none needed.");
}

/**
 * Returns the action definition whose bulb button should be shown for the
 * given activity type, or undefined if no action claims the bulb there.
 */
export function getBulbActionForActivityType(
  activityType: ActivityTypeKind,
): ActionDefinition | undefined {
  return Object.values(ACTION_REGISTRY).find((def) =>
    def?.clientTrigger?.bulbForActivityTypes?.includes(activityType),
  );
}

/**
 * Returns action kinds that should always be included in availableActions for
 * the given activity type, regardless of teacher configuration.
 */
export function getAutoAvailableActions(activityType: ActivityTypeKind): ActionKind[] {
  return Object.values(ACTION_REGISTRY)
    .filter((def) => def?.clientTrigger?.autoAvailableForActivityTypes?.includes(activityType))
    .map((def) => def!.kind);
}

/**
 * Per-action system-prompt guidance for the enabled kinds, joined. Returns a
 * fallback instruction when nothing is enabled.
 */
export function buildActionsDirective(enabledKinds: ActionKind[]): string {
  const enabled = filterImplemented(enabledKinds);
  if (enabled.length === 0) {
    return "Always set `action` to null.";
  }
  return enabled
    .map((k) => getActionDefinition(k).buildDirective())
    .filter(Boolean)
    .join("\n");
}
