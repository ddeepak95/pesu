import { Assignment, Question, RubricItem } from "@/types/assignment";
import { supportedLanguages } from "@/utils/supportedLanguages";

/**
 * Context for interpolating prompt templates.
 * Contains all variable values that can be substituted.
 */
export interface InterpolationContext {
  language: string;
  question_prompt: string;
  rubric: string;
  expected_answer: string;
  max_attempts: number;
  total_questions: number;
  attempt_number: number;
  question_order: number;
}

/**
 * Sample values for runtime variables (used in preview only).
 * These are shown to teachers when previewing prompts.
 */
export const PREVIEW_SAMPLE_VALUES = {
  attempt_number: 1,
  question_order: 0,
};

/**
 * Interpolate all {{variable}} placeholders in a template.
 * Used for both preview (sample values) and runtime (actual values).
 *
 * @param template - The template string with {{variable}} placeholders
 * @param context - The context containing variable values
 * @returns The interpolated string with all placeholders replaced
 */
export function interpolatePrompt(
  template: string,
  context: Partial<InterpolationContext>
): string {
  let result = template;
  for (const [key, value] of Object.entries(context)) {
    if (value !== undefined && value !== null) {
      result = result.replace(
        new RegExp(`\\{\\{${key}\\}\\}`, "g"),
        String(value)
      );
    }
  }
  return result;
}

/**
 * Format rubric items for inclusion in a prompt.
 *
 * @param rubric - Array of rubric items
 * @returns Formatted string with rubric items and points
 */
export function formatRubricForPrompt(rubric: RubricItem[]): string {
  if (!rubric || rubric.length === 0) {
    return "No specific rubric provided.";
  }
  return rubric.map((r) => `- ${r.item} (${r.points} points)`).join("\n");
}

/**
 * Get the language name from a language code.
 *
 * @param languageCode - The language code (e.g., "en", "ta")
 * @returns The language name (e.g., "English", "Tamil")
 */
export function getLanguageName(languageCode: string): string {
  const language = supportedLanguages.find((l) => l.code === languageCode);
  return language?.name || languageCode;
}

/**
 * Build context for preview (uses sample values for runtime vars).
 * Used when teachers are previewing their prompt configurations.
 *
 * @param assignment - The assignment being configured
 * @param question - The question to preview (optional, uses placeholder if not provided)
 * @param languageCode - The language code
 * @returns InterpolationContext with sample runtime values
 */
export function buildPreviewContext(
  assignment: Partial<Assignment>,
  question?: Partial<Question>,
  languageCode?: string
): InterpolationContext {
  const lang = languageCode || assignment.preferred_language || "en";

  return {
    language: getLanguageName(lang),
    question_prompt: question?.prompt || "[Question prompt will appear here]",
    rubric: formatRubricForPrompt(question?.rubric || []),
    expected_answer: question?.expected_answer || "",
    max_attempts: assignment.max_attempts || 1,
    total_questions: assignment.questions?.length || 1,
    ...PREVIEW_SAMPLE_VALUES, // Use sample values for runtime variables
  };
}

/**
 * Build context for runtime (uses actual values).
 * Used when a student is taking an assessment.
 *
 * @param assignment - The assignment being taken
 * @param question - The current question
 * @param languageCode - The language code
 * @param attemptNumber - The actual attempt number (1-based)
 * @param questionOrder - The actual question order (0-based)
 * @returns InterpolationContext with actual runtime values
 */
export function buildRuntimeContext(
  assignment: Assignment,
  question: Question,
  languageCode: string,
  attemptNumber: number,
  questionOrder: number
): InterpolationContext {
  return {
    language: getLanguageName(languageCode),
    question_prompt: question.prompt,
    rubric: formatRubricForPrompt(question.rubric),
    expected_answer: question.expected_answer || "",
    max_attempts: assignment.max_attempts || 1,
    total_questions: assignment.questions.length,
    attempt_number: attemptNumber,
    question_order: questionOrder,
  };
}

/**
 * Get the appropriate conversation start message based on question order.
 *
 * @param config - The bot prompt config
 * @param questionOrder - The question order (0-based)
 * @returns The conversation start template (not interpolated)
 */
export function getConversationStartTemplate(
  config: { conversation_start: { first_question: string; subsequent_questions: string } },
  questionOrder: number
): string {
  return questionOrder === 0
    ? config.conversation_start.first_question
    : config.conversation_start.subsequent_questions;
}

/**
 * Interpolate all prompts for a given question at runtime.
 * Returns ready-to-use prompts that can be sent directly to the server.
 *
 * @param assignment - The assignment
 * @param question - The current question
 * @param languageCode - The language code
 * @param attemptNumber - Current attempt number (1-based)
 * @returns Object with interpolated system_prompt and greeting
 */
export function interpolatePromptsForRuntime(
  assignment: Assignment,
  question: Question,
  languageCode: string,
  attemptNumber: number
): { system_prompt: string; greeting: string } | null {
  const config = assignment.bot_prompt_config;

  if (!config) {
    return null; // No custom config, server will use defaults
  }

  const context = buildRuntimeContext(
    assignment,
    question,
    languageCode,
    attemptNumber,
    question.order
  );

  // Check for question-specific overrides
  // Note: JSON keys are always strings, so we need to check both number and string keys
  const questionOverride = config.question_overrides?.[question.order] 
    || config.question_overrides?.[String(question.order) as unknown as number];

  // Get the system prompt (with override if exists)
  const systemPromptTemplate =
    questionOverride?.system_prompt || config.system_prompt;

  // Get the conversation start template
  // Question override has a single string, assignment-level has first/subsequent
  let greetingTemplate: string;
  if (questionOverride?.conversation_start) {
    // Use the question-specific greeting
    greetingTemplate = questionOverride.conversation_start;
  } else {
    // Fall back to assignment-level first/subsequent logic
    greetingTemplate =
      question.order === 0
        ? config.conversation_start.first_question
        : config.conversation_start.subsequent_questions;
  }

  return {
    system_prompt: interpolatePrompt(systemPromptTemplate, context),
    greeting: interpolatePrompt(greetingTemplate, context),
  };
}
