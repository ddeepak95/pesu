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

import { mcqActionInputSchema } from "./schema";
import type { ActionKind } from "./types";

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
}

const MCQ_DIRECTIVE = [
  "Actively check the learner's understanding with multiple choice questions. " +
    "After you explain or discuss a discrete concept, attach ONE question via the " +
    '`action` field: set `action.kind` to "mcq", `action.topic` to the concept to ' +
    "assess, and `action.difficulty` to easy, medium, or hard. In your `speech`, " +
    "briefly tell the learner that a question will appear in the content box on " +
    "their screen for them to answer. Attach at most one action per turn — set " +
    "`action` to null only while you are still explaining or the learner is " +
    "mid-thought — but lean toward posing a question whenever you have just " +
    "covered an idea worth checking.",
  "When the learner answers, you receive a hidden note with the result, the " +
    "correct answer, and an explanation. If they were WRONG, give a brief spoken " +
    "hint WITHOUT stating the correct answer and re-ask the SAME question by " +
    'setting `action.kind` to "mcq" with `action.repeatPrevious` set to true. If ' +
    "they were CORRECT, acknowledge it and move on (do not re-ask). If they have " +
    "struggled several times, you may reveal the answer and move on instead of re-asking.",
].join("\n");

/**
 * Only kinds with a real handler/schema appear here. Future kinds
 * (image/video/equation/animation) are added once their handler ships.
 */
export const ACTION_REGISTRY: Partial<Record<ActionKind, ActionDefinition>> = {
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
