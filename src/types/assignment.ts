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
}

