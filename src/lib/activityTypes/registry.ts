/**
 * Activity-type registry — the single source of truth for activity types.
 *
 * Pure / client-safe: no server-only imports. The prompt builders
 * (`promptTemplates.ts`), the teacher form, the Question Card, and the server
 * multimodal directive builder (`chat-stream-object.ts`) all read this registry,
 * so a new activity type is added here once. See docs/adding-activity-types.md.
 */

import type {
  ActivityTypeDefinition,
  ActivityTypeKind,
  ActivityTypeLabels,
} from "./types";
import { DEFAULT_ACTIVITY_TYPE_LABELS } from "./types";
import { LEARNING_DEFINITION } from "./learning";
import { ASSESSMENT_DEFINITION } from "./assessment";
import { SPEAKING_PRACTICE_DEFINITION } from "./speaking_practice";
import { CODE_REVIEW_DEFINITION } from "./code-review";

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
All feedback text (per-rubric feedback and overall_feedback) is displayed as plain text to students. Do NOT use any special characters, markdown formatting, or code blocks in feedback. Keep feedback concise, clear, and constructive.

SAFETY:
The users are students. All feedback must be age-appropriate, supportive, and respectful. Never include anything offensive, inappropriate, or sexual in your evaluation feedback.`;

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
