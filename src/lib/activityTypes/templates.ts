/**
 * Activity-template shapes — Phase 1 of dev-docs/activity-templates-plan.md.
 *
 * Pure / client-safe (no server-only imports). Defines:
 *   - the serialized `definition` variant zod schema (a template's editable
 *     payload — modeled on `ActivityTypeDefinition` but WITHOUT `kind`/`label`,
 *     which are the row's identity/columns; §4 decision 1),
 *   - the fixed, well-known UUIDs the 4 built-in `kind`s are seeded under (§6.4),
 *   - `registryToDefinition` (built-in kind → definition, the seed source), and
 *   - `normalizeDefinition` (tolerant read: validate a stored jsonb `definition`,
 *     degrade to `null` so the resolver can fall back to the registry).
 *
 * The registry stays the bootstrap seed + legacy fallback; the DB is the source
 * of truth once Phase 1 seeds these rows.
 */

import { z } from "zod";

import {
  getAutoAvailableActions,
  getBulbActionForActivityType,
} from "@/lib/multimodal/actions/registry";

import {
  getActivityTypeDefinition,
  getActivityTypeLabels,
  getDefaultFeedbackFocusAreas,
} from "./registry";
import type { ActivityTypeKind } from "./types";

/**
 * Fixed, well-known UUIDs for the seeded `owner_scope='system'` rows — one per
 * built-in kind. There is no `slug`: this map is how a built-in `kind` resolves
 * to its seeded row id (used by the seed, the assignment provenance link, and
 * the resolver). Keep in sync with the migration's seed and with
 * `ACTIVITY_TYPE_KINDS`. A new built-in kind gets a fresh fixed UUID here.
 */
export const SYSTEM_TEMPLATE_IDS: Record<ActivityTypeKind, string> = {
  learning: "11111111-1111-4111-8111-000000000001",
  assessment: "11111111-1111-4111-8111-000000000002",
  speaking_practice: "11111111-1111-4111-8111-000000000003",
  code_review: "11111111-1111-4111-8111-000000000004",
};

/** Reverse lookup: seeded system-row id → built-in kind (for registry fallback). */
export const SYSTEM_TEMPLATE_ID_TO_KIND: Record<string, ActivityTypeKind> =
  Object.fromEntries(
    Object.entries(SYSTEM_TEMPLATE_IDS).map(([kind, id]) => [
      id,
      kind as ActivityTypeKind,
    ]),
  );

const actionKindSchema = z.enum([
  "mcq",
  "image",
  "video",
  "equation",
  "animation",
  "suggested_response",
  "display_content",
]);

const interactionTypeSchema = z.enum([
  "voice",
  "text_chat",
  "static_text",
  "multimodal",
]);

const labelsSchema = z.object({
  question: z.string(),
  questionPlaceholder: z.string(),
  rubric: z.string(),
  rubricItemPlaceholder: z.string(),
  rubricItemNoun: z.string(),
  expectedAnswer: z.string(),
  expectedAnswerPlaceholder: z.string(),
  expectedAnswerHelp: z.string(),
  questionNoun: z.string(),
});

const feedbackFocusAreaSchema = z.object({
  title: z.string(),
  description: z.string(),
});

const defaultsSchema = z.object({
  interactionType: interactionTypeSchema.optional(),
  display: z.object({ useStarDisplay: z.boolean().optional() }).optional(),
  fileSubmission: z.object({ required: z.boolean().optional() }).optional(),
  multimodal: z
    .object({
      languageSupportEnabled: z.boolean().optional(),
      availableActions: z.array(actionKindSchema).optional(),
    })
    .optional(),
});

const generationSchema = z.object({
  rubricCoverage: z.string().optional(),
  expectedAnswerCoverage: z.string().optional(),
  guidance: z.string().optional(),
  dynamicGenerationGuidance: z.string().optional(),
});

/**
 * The serialized template `definition` — validated on every write and on every
 * read (so a malformed row degrades to the registry default, mirroring the
 * settings resolver's `safeValidate`). Prompt/label/directive fields mirror
 * `ActivityTypeDefinition` minus `kind`/`label`. `autoActions`/`bulbAction`
 * (the inverted action↔type wiring) are accepted now but only authored/read
 * from Phase 2 — optional here so Phase 1 seeds validate.
 */
export const templateDefinitionSchema = z.object({
  systemPrompt: z.string(),
  conversationStart: z.object({
    first_question: z.string(),
    subsequent_questions: z.string(),
  }),
  evaluationPrompt: z.string(),
  evaluationSystemPersona: z.string(),
  labels: labelsSchema,
  defaultFeedbackFocusAreas: z.array(feedbackFocusAreaSchema),
  defaults: defaultsSchema,
  generation: generationSchema,
  actionDirective: z.string().optional(),
  languageSupportDirective: z.string().optional(),
  endConditionInstruction: z.string(),
  // Phase 2 (action↔type inversion, Appendix A) — optional until then.
  autoActions: z.array(actionKindSchema).optional(),
  bulbAction: z.union([actionKindSchema, z.literal("none")]).optional(),
});

export type TemplateDefinition = z.infer<typeof templateDefinitionSchema>;

/**
 * Build the serialized `definition` for a built-in kind — the seed source and
 * the snapshot written onto an assignment. Labels and feedback-focus areas are
 * fully *resolved* (defaults merged in) so the definition is self-contained.
 */
export function registryToDefinition(
  kind: ActivityTypeKind,
): TemplateDefinition {
  const def = getActivityTypeDefinition(kind);
  return {
    systemPrompt: def.systemPrompt,
    conversationStart: { ...def.conversationStart },
    evaluationPrompt: def.evaluationPrompt,
    evaluationSystemPersona: def.evaluationSystemPersona,
    labels: getActivityTypeLabels(kind),
    defaultFeedbackFocusAreas: getDefaultFeedbackFocusAreas(kind),
    defaults: def.defaults ?? {},
    generation: def.generation ?? {},
    ...(def.actionDirective !== undefined
      ? { actionDirective: def.actionDirective }
      : {}),
    ...(def.languageSupportDirective !== undefined
      ? { languageSupportDirective: def.languageSupportDirective }
      : {}),
    endConditionInstruction: def.endConditionInstruction,
    // Action↔type wiring, inverted onto the template (Phase 2, Appendix A). Today
    // the *action* registry declares which kinds attach to which activity type;
    // we resolve that here so the definition carries it, and custom (non-`kind`)
    // templates can author their own bulb/auto actions. Runtime reads prefer
    // these via `resolveAutoActions`/`resolveBulbAction`, falling back to the
    // kind-keyed lookups for legacy snapshots.
    autoActions: getAutoAvailableActions(kind),
    bulbAction: getBulbActionForActivityType(kind)?.kind ?? "none",
  };
}

/**
 * Validate a stored jsonb `definition`. Returns the parsed definition, or
 * `null` when malformed so callers can fall back to the registry (the resolver
 * never throws on a bad row).
 */
export function normalizeDefinition(raw: unknown): TemplateDefinition | null {
  const parsed = templateDefinitionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
