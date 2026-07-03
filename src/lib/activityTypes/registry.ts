/**
 * Activity-type registry — the single source of truth for activity types.
 *
 * Pure / client-safe: no server-only imports. The prompt builders
 * (`promptTemplates.ts`), the teacher form, the Question Card, and the server
 * multimodal directive builder (`chat-stream-object.ts`) all read this registry,
 * so a new activity type is added here once. See dev-docs/adding-activity-types.md.
 */

import type {
  ActivityTypeDefinition,
  ActivityTypeKind,
  ActivityTypeLabels,
} from "./types";
import { DEFAULT_ACTIVITY_TYPE_LABELS } from "./types";
import {
  COMMON_DEFAULT_FEEDBACK_FOCUS_AREAS,
  type FeedbackFocusArea,
} from "@/lib/feedbackFocus";
import { LEARNING_DEFINITION } from "./learning";
import { ASSESSMENT_DEFINITION } from "./assessment";
import { SPEAKING_PRACTICE_DEFINITION } from "./speaking_practice";
import { CODE_REVIEW_DEFINITION } from "./code-review";
import { SAFETY_DIRECTIVE } from "@/lib/ai/safetyDirective";

export const ACTIVITY_TYPE_REGISTRY: Record<
  ActivityTypeKind,
  ActivityTypeDefinition
> = {
  learning: LEARNING_DEFINITION,
  assessment: ASSESSMENT_DEFINITION,
  speaking_practice: SPEAKING_PRACTICE_DEFINITION,
  code_review: CODE_REVIEW_DEFINITION,
};

/** Shared output-format and safety rules appended to every evaluation system message. */
export const EVALUATION_SYSTEM_SHARED_FOOTER = `OUTPUT FORMAT:
Return both \`rubric_scores\` (the grade) and \`feedback_output\` (a structured feedback output shown to the student).

For each rubric item in \`rubric_scores\`, assign \`points_earned\` (0 to that item's maximum — do not exceed it), set \`points_possible\` to match that maximum, and give specific, constructive \`feedback\` for that item.

Compose \`feedback_output\` as a list of titled "section" blocks. Each "section" has a \`title\` (a short heading) and a \`content\` string (a single plain-text body covering that area; use "\n" line breaks within \`content\` to separate paragraphs or points).

Rules:
- \`feedback_output\` must be { "version": 1, "blocks": [...] }, where every block is a "section". Use about 2-4 sections.
- Do NOT include the rubric scores in \`feedback_output\` — the rubric breakdown is shown automatically after your sections, rendered from rubric_scores. Do not restate the scores as text.
- Section titles are dynamic — choose them to reflect the teacher's feedback focus and what matters for this activity (e.g. "What you did well", "Where to improve", "Concept understanding"). Do NOT invent generic boilerplate titles when a more specific one fits.
- Every text field is PLAIN TEXT. Do NOT use markdown, code blocks, asterisks, or other special formatting characters inside any text field.
- Keep \`overall_feedback\` as a short plain-text summary of the same feedback (used as a fallback); the detailed structure lives in \`feedback_output\`.

${SAFETY_DIRECTIVE}`;

export function buildEvaluationSystemMessage(
  activityType: ActivityTypeKind = "learning",
): string {
  const persona =
    getActivityTypeDefinition(activityType).evaluationSystemPersona;
  return `${persona}\n\n${EVALUATION_SYSTEM_SHARED_FOOTER}`;
}

export function getActivityTypeDefinition(
  kind: ActivityTypeKind,
): ActivityTypeDefinition {
  return ACTIVITY_TYPE_REGISTRY[kind] ?? ACTIVITY_TYPE_REGISTRY.learning;
}

/** All activity types in dropdown order. */
export function listActivityTypes(): ActivityTypeDefinition[] {
  return Object.values(ACTIVITY_TYPE_REGISTRY);
}

/** Default "Feedback focus" areas pre-filled in the teacher editor for a type. */
export function getDefaultFeedbackFocusAreas(
  kind: ActivityTypeKind,
): FeedbackFocusArea[] {
  const areas = getActivityTypeDefinition(kind).defaultFeedbackFocusAreas;
  return (areas ?? COMMON_DEFAULT_FEEDBACK_FOCUS_AREAS).map((a) => ({ ...a }));
}

export const ACTIVITY_TYPE_KINDS = Object.keys(
  ACTIVITY_TYPE_REGISTRY,
) as ActivityTypeKind[];

/** Effective Question Card labels for a type (entry overrides over defaults). */
export function getActivityTypeLabels(
  kind: ActivityTypeKind,
): ActivityTypeLabels {
  return {
    ...DEFAULT_ACTIVITY_TYPE_LABELS,
    ...getActivityTypeDefinition(kind).labels,
  };
}

/** Resolved wording for the rubric/expected-answer generator (server-side). */
export interface ActivityTypeGenerationCopy {
  /** Noun for the prompt concept, e.g. "question" / "scenario". */
  conceptNoun: string;
  /** Noun for the rubric, e.g. "rubric" / "aspects to cover in the scenario". */
  rubricNoun: string;
  /** Noun for the expected answer, e.g. "expected answer" / "scenario context". */
  expectedAnswerNoun: string;
  /** Phrase describing what the rubric items should cover. */
  rubricCoverage: string;
  /** Phrase describing what the expected answer captures. */
  expectedAnswerCoverage: string;
  /** Extra system-prompt guidance ("" when none). */
  guidance: string;
}

/**
 * Activity-type-aware copy for the generation endpoint. Nouns derive from the
 * UI labels (lowercased) so they stay in sync; coverage/guidance come from the
 * entry's `generation` block with sensible defaults.
 */
export function getActivityTypeGenerationCopy(
  kind: ActivityTypeKind,
): ActivityTypeGenerationCopy {
  const labels = getActivityTypeLabels(kind);
  const generation = getActivityTypeDefinition(kind).generation ?? {};
  return {
    conceptNoun: labels.questionNoun,
    rubricNoun: labels.rubric.toLowerCase(),
    expectedAnswerNoun: labels.expectedAnswer.toLowerCase(),
    rubricCoverage:
      generation.rubricCoverage ?? "what a good answer should include",
    expectedAnswerCoverage:
      generation.expectedAnswerCoverage ??
      "the key points the answer should cover",
    guidance: generation.guidance ?? "",
  };
}
