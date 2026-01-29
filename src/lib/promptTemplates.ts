import { BotPromptConfig } from "@/types/assignment";

/**
 * Supported variable placeholders for prompt templates.
 * These can be inserted into system prompts and conversation start messages.
 */
export const PROMPT_VARIABLES = {
  language: {
    placeholder: "{{language}}",
    description: "The selected language name (e.g., English, Tamil)",
    category: "static" as const,
  },
  question_prompt: {
    placeholder: "{{question_prompt}}",
    description: "The question text",
    category: "static" as const,
  },
  rubric: {
    placeholder: "{{rubric}}",
    description: "Formatted rubric items with points",
    category: "static" as const,
  },
  expected_answer: {
    placeholder: "{{expected_answer}}",
    description: "Expected answer key points",
    category: "static" as const,
  },
  max_attempts: {
    placeholder: "{{max_attempts}}",
    description: "Maximum allowed attempts",
    category: "static" as const,
  },
  total_questions: {
    placeholder: "{{total_questions}}",
    description: "Total number of questions in the assignment",
    category: "static" as const,
  },
  attempt_number: {
    placeholder: "{{attempt_number}}",
    description: "Current attempt number (1, 2, 3...)",
    category: "runtime" as const,
  },
  question_order: {
    placeholder: "{{question_order}}",
    description: "Current question index (0-based)",
    category: "runtime" as const,
  },
} as const;

export type PromptVariableKey = keyof typeof PROMPT_VARIABLES;

/**
 * Get all variable placeholders as an array
 */
export function getAllVariablePlaceholders(): string[] {
  return Object.values(PROMPT_VARIABLES).map((v) => v.placeholder);
}

/**
 * Get variables by category
 */
export function getVariablesByCategory(category: "static" | "runtime") {
  return Object.entries(PROMPT_VARIABLES)
    .filter(([, v]) => v.category === category)
    .map(([key, v]) => ({ key, ...v }));
}

/**
 * Default system prompt template (mode-agnostic).
 * Works for both voice and chat assessment modes.
 * For voice mode, TTS instruction is appended server-side.
 */
export const DEFAULT_SYSTEM_PROMPT = `You are a friendly teacher named Konvo, helping a student with a formative assessment in {{language}}.

The student needs to answer this question:
{{question_prompt}}

Evaluation criteria:
{{rubric}}

Your role:
1. Have a natural conversation to understand their thinking
2. Ask follow-up questions to gauge depth of understanding
3. Be encouraging and supportive
4. Help them elaborate if they're stuck, but don't give away the answer
5. Keep your questions and responses short and concise
6. Use English for concept-specific words while keeping the conversation in {{language}}`;

/**
 * Default conversation start for the first question.
 */
export const DEFAULT_CONVERSATION_START_FIRST = `Speaking in {{language}}, introduce yourself as Konvo. Say we are going to do an activity today. Ask if the student is ready to start.`;

/**
 * Default conversation start for subsequent questions (2nd, 3rd, etc.)
 */
export const DEFAULT_CONVERSATION_START_SUBSEQUENT = `Speaking in {{language}}, acknowledge we're moving to the next question, then ask the student to answer it.`;

/**
 * TTS instruction that is appended server-side for voice mode only.
 * This is NOT part of the teacher-editable template.
 */
export const TTS_INSTRUCTION = `The text you generate will be used by TTS, so avoid special characters. Use colloquial, friendly language.`;

/**
 * Get the default bot prompt configuration.
 * Teachers can customize this starting point.
 */
export function getDefaultBotPromptConfig(): BotPromptConfig {
  return {
    system_prompt: DEFAULT_SYSTEM_PROMPT,
    conversation_start: {
      first_question: DEFAULT_CONVERSATION_START_FIRST,
      subsequent_questions: DEFAULT_CONVERSATION_START_SUBSEQUENT,
    },
  };
}

/**
 * Check if a prompt template contains a specific variable
 */
export function hasVariable(
  template: string,
  variableKey: PromptVariableKey
): boolean {
  const placeholder = PROMPT_VARIABLES[variableKey].placeholder;
  return template.includes(placeholder);
}

/**
 * Get missing required variables from a system prompt template.
 * Returns variable keys that should typically be present.
 */
export function getMissingRequiredVariables(
  systemPrompt: string
): PromptVariableKey[] {
  const requiredVariables: PromptVariableKey[] = [
    "question_prompt",
    "rubric",
    "language",
  ];

  return requiredVariables.filter(
    (key) => !hasVariable(systemPrompt, key)
  );
}
