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
  /**
   * Multimodal-only preselection merged into bot_prompt_config.multimodal_actions
   * (languageSupportEnabled/availableActions) and bot_prompt_config.multimodal_interaction
   * (interactionConfig).
   */
  multimodal?: {
    languageSupportEnabled?: boolean;
    availableActions?: ActionKind[];
    /**
     * Mirrors MultimodalInteractionConfig's own input/output shape (see
     * lib/multimodal/turnConfig.ts) so this preselection stays structurally
     * parallel to the runtime config it seeds — future interaction-level
     * defaults (e.g. a speech-output mode) slot into `output` without another
     * reshape.
     */
    interactionConfig?: {
      input?: {
        /** Preselects which input methods the learner can use. Unset ⇒ audio-only. */
        modes?: ("text" | "audio")[];
        /** Preselects "direct audio input" (bypasses transcription) when the class's model supports it. */
        audioDelivery?: "transcribe" | "direct";
      };
      output?: {
        /** Preselects whether/when the tutor's reply is spoken. Unset ⇒ "automatic". */
        speechMode?: "automatic" | "on_demand" | "none";
      };
    };
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
   * Per-action pedagogy fragments, hand-written on this type: how/when to use
   * THIS type's enabled actions in context (e.g. tie an MCQ's topic to the
   * rubric, or constrain what display_content may show) — not general
   * persona/role guidance (that belongs in `systemPrompt`), and not an
   * action's own mechanics (schema fields, format — that belongs in the
   * action's own `buildDirective()` in the action registry, which already
   * applies whenever the action is enabled, for any type). Only the fragment
   * for a currently-enabled action is included in the composed prompt, and
   * it's auto-prefixed with that action's own live display label from the
   * action registry — authored text should not name the action itself. Omit
   * an action's key when the type has nothing specific to add for it.
   */
  actionGuidance?: Partial<Record<ActionKind, string>>;
  /**
   * Overrides the default "language support available" directive text (the
   * single, always-on instruction added whenever a support language is
   * configured, telling the model to reply inline in the support language when
   * the learner asks for help). May contain a {{support_language}} placeholder,
   * substituted with the resolved language label. When unset, the generic
   * default directive is used. Full replacement, not additive — set this when a
   * type needs different behavior than "translate this one turn" (e.g. Speaking
   * Practice stays in character and continues the role-play in the support
   * language).
   */
  languageSupportDirective?: string;
  /**
   * Guidance on *when* to end the conversation, specific to this activity
   * type. Layers onto the fixed base end-condition rule under a single "When
   * to end:" heading in the composed directive. Required — every activity
   * type should state its own end condition rather than relying on the base
   * rule alone.
   */
  endConditionInstruction: string;
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
