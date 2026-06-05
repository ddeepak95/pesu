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

import { mcqActionInputSchema, suggestedResponseActionInputSchema } from "./schema";
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

// One string per paragraph; joined for the orchestrator system prompt.
const MCQ_DIRECTIVE_PARAGRAPHS = [
  // Frequency: questions are deliberate checkpoints, not a reflex.
  "You may pose multiple choice questions, but use them sparingly — as deliberate comprehension checkpoints, not after every point. Only pose one once you have explained a substantial concept and the learner has had a chance to engage with it, and space them out so the conversation stays a genuine back-and-forth: most turns should set `action` to null and keep explaining or discussing. When a real checkpoint is reached, attach at most ONE question: set `action.kind` to \"mcq\", `action.topic` to the concept to assess, and `action.difficulty` to easy, medium, or hard, and briefly tell the learner in your `speech` that a question will appear on their screen. When in doubt, favor continuing the conversation over quizzing.",
  // Answer handling.
  'When the learner answers, you receive a hidden note with the result, the correct answer, and an explanation. If they were WRONG, give a brief spoken hint WITHOUT stating the correct answer and re-ask the SAME question by setting `action.kind` to "mcq" with `action.repeatPrevious` set to true. If they were CORRECT, acknowledge it and move on (do not re-ask). If they have struggled several times, you may reveal the answer and move on instead of re-asking.',
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
