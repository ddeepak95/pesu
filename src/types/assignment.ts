export interface RubricItem {
  item: string;
  points: number;
}

export interface Question {
  order: number;
  prompt: string;
  total_points: number;
  rubric: RubricItem[];
  supporting_content: string;
  expected_answer?: string;
}

export interface ResponderFieldConfig {
  field: string; // unique field identifier (e.g., "name", "email", "organization")
  type: "text" | "email" | "tel" | "select";
  label: string; // display label
  required: boolean;
  placeholder?: string;
  options?: string[]; // for select type
}

/**
 * Configuration for how the AI bot starts conversations.
 * Supports different greetings for first question vs subsequent questions.
 */
export interface ConversationStartConfig {
  first_question: string; // Greeting/intro for the first question
  subsequent_questions: string; // Greeting for questions 2+
}

/**
 * Per-question override for bot behavior.
 * Simpler than BotPromptConfig - just system_prompt and a single conversation_start.
 */
export interface QuestionPromptOverride {
  system_prompt?: string;
  conversation_start?: string; // Single greeting for this specific question
}

/**
 * Configuration for AI bot behavior in voice and chat assessment modes.
 * Uses variable placeholders like {{language}}, {{question_prompt}}, {{rubric}}, etc.
 */
export interface BotPromptConfig {
  system_prompt: string;
  conversation_start: ConversationStartConfig;
  /**
   * Optional per-question overrides for system prompt and conversation start.
   * Key is the question order (0-based index).
   */
  question_overrides?: Record<number, QuestionPromptOverride>;
}

export interface Assignment {
  id: string;
  assignment_id: string;
  class_id: string;
  class_group_id?: string | null;
  title: string;
  questions: Question[];
  total_points: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  status: "draft" | "active" | "deleted";
  preferred_language: string;
  is_public: boolean;
  /**
   * Assessment delivery mode for this assignment.
   * Defaults to "voice" for legacy assignments where this field is missing.
   */
  assessment_mode?: "voice" | "text_chat" | "static_text";
  /**
   * Configuration for responder details collection in public assignments.
   * Defines what fields to collect from public responders.
   */
  responder_fields_config?: ResponderFieldConfig[];
  /**
   * Maximum number of attempts allowed per student for this assignment.
   * Defaults to 1 if not specified.
   */
  max_attempts?: number;
  /**
   * Configuration for AI bot behavior in voice and chat assessment modes.
   * Contains system prompt template and conversation start configurations.
   * If not set, server uses default hardcoded prompts.
   */
  bot_prompt_config?: BotPromptConfig;
  /**
   * When true, students cannot change the interaction language during the assessment.
   * The language is fixed to preferred_language.
   */
  lock_language?: boolean;
  /**
   * Display-only instructions shown to students before they start the assessment.
   * Not passed to the AI prompt - purely for student information.
   */
  student_instructions?: string;
  /**
   * Whether to show the rubric to students during the assessment.
   * Defaults to true for backwards compatibility.
   */
  show_rubric?: boolean;
  /**
   * Whether to show rubric point values to students.
   * Only applies when show_rubric is true.
   * Defaults to true for backwards compatibility.
   */
  show_rubric_points?: boolean;
  /**
   * Whether to show star ratings instead of points to students.
   * Defaults to false for backwards compatibility.
   */
  use_star_display?: boolean;
  /**
   * Number of stars in the rating scale (e.g., 5, 10, 20).
   * Only applies when use_star_display is true.
   * Defaults to 5.
   */
  star_scale?: number;
  /**
   * Whether the teacher views stars or points in their submissions view.
   * Defaults to false (points).
   */
  teacher_view_stars?: boolean;
  /**
   * When true, students must attempt all questions before marking complete.
   * Defaults to false for backwards compatibility.
   */
  require_all_attempts?: boolean;
  /**
   * When true, a shared context is shown to students and included in all prompts.
   * Defaults to false.
   */
  shared_context_enabled?: boolean;
  /**
   * The shared context text (e.g. a case study, passage, scenario).
   * Only used when shared_context_enabled is true.
   */
  shared_context?: string;
  /**
   * Custom evaluation prompt template. If set, replaces the hardcoded evaluation prompt.
   * Supports placeholders: {{language}}, {{question_prompt}}, {{rubric}}, {{answer_text}}, {{shared_context}}
   */
  evaluation_prompt?: string;
  /**
   * When true, students are asked to rate their experience when completing the assessment.
   * Defaults to false.
   */
  experience_rating_enabled?: boolean;
  /**
   * When true, students must provide a rating before completing (otherwise they can skip).
   * Only applies when experience_rating_enabled is true.
   * Defaults to false.
   */
  experience_rating_required?: boolean;
}

