/**
 * Activity-type types — pure / client-safe (no server-only imports), so this
 * module can be imported from prompt builders, client components, and the
 * server multimodal directive builder alike.
 *
 * An "activity type" describes the pedagogical shape of an assignment (a
 * learning activity, an assessment, a speaking-practice scenario, …). It drives
 * the default AI prompts, the evaluation prompt, the Question Card UI labels, and
 * the config preselected when a teacher picks it. New types are added in one
 * place — see docs/adding-activity-types.md.
 */

import type { ActionKind } from "@/lib/multimodal/actions/types";

export type ActivityTypeKind = "learning" | "assessment" | "speaking_practice";

/** Interaction modes (mirrors InteractionType in promptTemplates / AssessmentMode). */
export type ActivityInteractionType =
  | "voice"
  | "text_chat"
  | "static_text"
  | "multimodal";

/** Activity-type-specific overrides for the Question Card UI strings. */
export interface ActivityTypeLabels {
  /** Prompt field label (default "Question"). */
  question: string;
  /** Prompt field placeholder. */
  questionPlaceholder: string;
  /** Rubric section label (default "Rubric"). */
  rubric: string;
  /** Placeholder for each rubric item's text input. */
  rubricItemPlaceholder: string;
  /** Singular noun for one rubric row (column header / add button). */
  rubricItemNoun: string;
  /** Expected-answer field label (default "Expected Answer"). */
  expectedAnswer: string;
  /** Expected-answer field placeholder. */
  expectedAnswerPlaceholder: string;
  /** Help text under the expected-answer field. */
  expectedAnswerHelp: string;
  /** Noun used in validation/dialog copy (default "question"). */
  questionNoun: string;
}

/**
 * Activity-type-specific guidance for the rubric / expected-answer generator
 * (`/api/generate-rubric-and-answer`). All fields optional — unset falls back to
 * the generic "question/rubric/expected answer" wording.
 */
export interface ActivityTypeGeneration {
  /** Phrase describing what the rubric items should collectively cover. */
  rubricCoverage?: string;
  /** Phrase describing what the expected-answer field captures. */
  expectedAnswerCoverage?: string;
  /** Extra system-prompt paragraph appended for this activity type. */
  guidance?: string;
}

/** Config preselected in the teacher form when this activity type is chosen. */
export interface ActivityTypeDefaults {
  /** Interaction type to switch to (applied only if the class allows it). */
  interactionType?: ActivityInteractionType;
  /** Multimodal-only preselection merged into bot_prompt_config.multimodal_actions. */
  multimodal?: {
    languageSupportEnabled?: boolean;
    availableActions?: ActionKind[];
  };
}

export interface ActivityTypeDefinition {
  kind: ActivityTypeKind;
  /** Label shown in the Activity Type dropdown. */
  label: string;
  /** Persona fragment of the default system prompt. */
  persona: string;
  /** Task-instructions fragment of the default system prompt. */
  taskInstructions: string;
  /** Default conversation-start greetings. */
  conversationStart: {
    first_question: string;
    subsequent_questions: string;
  };
  /** Default evaluation prompt template. */
  evaluationPrompt: string;
  /**
   * Language the evaluation feedback should be written in. "primary" (default) =
   * the conversation language; "support" = the learner's support language (falls
   * back to primary when none is configured). Resolves the `{{feedback_language}}`
   * placeholder via `resolveFeedbackLanguageCode`.
   */
  evaluationFeedbackLanguage?: "primary" | "support";
  /** UI label overrides; empty = use DEFAULT_ACTIVITY_TYPE_LABELS. */
  labels: Partial<ActivityTypeLabels>;
  /** Config preselected when the teacher picks this type. */
  defaults?: ActivityTypeDefaults;
  /** Activity-type-specific guidance for the rubric/expected-answer generator. */
  generation?: ActivityTypeGeneration;
  /**
   * Optional extra multimodal system-prompt directive, appended after the
   * actions + end-conversation directives. Return null for none.
   */
  buildMultimodalDirective?: () => string | null;
  /**
   * Optional override of the ACTIVE language-support directive (the turn that
   * speaks in the support language). Return null to fall back to the default
   * literal-translation directive.
   */
  buildLanguageSupportActiveDirective?: (input: {
    languageLabel: string;
    primaryLanguageLabel?: string;
  }) => string | null;
}

export const DEFAULT_ACTIVITY_TYPE_LABELS: ActivityTypeLabels = {
  question: "Question",
  questionPlaceholder: "Enter the question text",
  rubric: "Rubric",
  rubricItemPlaceholder: "Rubric item description",
  rubricItemNoun: "Rubric Item",
  expectedAnswer: "Expected Answer",
  expectedAnswerPlaceholder:
    "Enter details about what the answer should cover (optional)",
  expectedAnswerHelp:
    "Key points the answer should cover. Guides AI evaluation; not shown to learners.",
  questionNoun: "question",
};
