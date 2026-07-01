/**
 * Activity-type types — pure / client-safe (no server-only imports), so this
 * module can be imported from prompt builders, client components, and the
 * server multimodal directive builder alike.
 *
 * An "activity type" describes the pedagogical shape of an assignment (a
 * learning activity, an assessment, a speaking-practice scenario, …). It drives
 * the default AI prompts, the evaluation prompt, the Question Card UI labels, and
 * the config preselected when a teacher picks it. New types are added in one
 * place — see dev-docs/adding-activity-types.md.
 */

import type { ActionKind } from "@/lib/multimodal/actions/types";
import type { FeedbackFocusArea } from "@/lib/feedbackFocus";

export type ActivityTypeKind = "learning" | "assessment" | "speaking_practice" | "code_review";

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
  /** Extra rules appended to the dynamic question generation prompt for this activity type. */
  dynamicGenerationGuidance?: string;
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
  /** Display-setting presets applied when this activity type is chosen. */
  display?: {
    /** Default the "show scores as stars" toggle to this value. */
    useStarDisplay?: boolean;
  };
  /** File submission presets applied when this activity type is chosen. */
  fileSubmission?: {
    /** When true, the file-submission toggle is switched on and default file types are applied if none are set. */
    required?: boolean;
  };
}

export interface ActivityTypeDefinition {
  kind: ActivityTypeKind;
  /** Label shown in the Activity Type dropdown. */
  label: string;
  /** The default system prompt — who the AI is and what it should do. */
  systemPrompt: string;
  /** Default conversation-start greetings. */
  conversationStart: {
    first_question: string;
    subsequent_questions: string;
  };
  /** Default evaluation prompt template. */
  evaluationPrompt: string;
  /**
   * Type-specific evaluator persona for the LLM evaluation system message
   * (plain text, not Handlebars). Combined with a shared output/safety footer
   * via `buildEvaluationSystemMessage`.
   */
  evaluationSystemPersona: string;
  /** UI label overrides; empty = use DEFAULT_ACTIVITY_TYPE_LABELS. */
  labels: Partial<ActivityTypeLabels>;
  /**
   * Default "Feedback focus" areas pre-filled in the teacher editor for this
   * activity type. Each area's title becomes a feedback section title; the
   * description steers what that section covers. Falls back to
   * COMMON_DEFAULT_FEEDBACK_FOCUS_AREAS when omitted.
   */
  defaultFeedbackFocusAreas?: FeedbackFocusArea[];
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
   * Optional override of the language-support directive — the single, always-on
   * instruction (added whenever a support language is configured) that tells the
   * model to reply inline in the support language when the learner asks for help.
   *
   * Return a string to replace the default directive text.
   * Return null to suppress language help entirely for this activity type (no
   *   directive is added).
   * Return undefined (or omit the hook) to use the default directive.
   */
  buildLanguageSupportDirective?: (input: {
    languageLabel: string;
  }) => string | null | undefined;
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
