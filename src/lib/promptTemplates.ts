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
  additional_context: {
    placeholder: "{{additional_context}}",
    description:
      "Additional context (e.g. case study, passage); stored as shared_context in the DB",
    category: "static" as const,
  },
  answer_text: {
    placeholder: "{{answer_text}}",
    description: "The student's submitted answer text",
    category: "runtime" as const,
  },
  file_submissions: {
    placeholder: "{{file_submissions}}",
    description:
      "Formatted content of uploaded files (parsed markdown); populated when file submission is enabled",
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

// ---------------------------------------------------------------------------
// Fragment-based prompt builder
// ---------------------------------------------------------------------------

export type ActivityType = "assessment" | "learning";
export type InteractionType = "voice" | "text_chat" | "static_text";

const COMMON_INSTRUCTIONS = `{{#if file_submissions}}
{{file_submissions}}

{{/if}}The student needs to answer this question:
{{question_prompt}}

Evaluation criteria:
{{rubric}}

{{#if expected_answer}}
Expected answer guidance (for your reference only, do NOT reveal to the student):
{{expected_answer}}
{{/if}}

Guidelines:
- Use English for concept-specific words while keeping the conversation in {{language}}
- Be encouraging and supportive
- Keep your questions and responses short and concise`;

const PERSONA: Record<ActivityType, string> = {
  assessment:
    "You are a friendly teacher named Konvo, helping a student with a formative assessment in {{language}}.",
  learning:
    "You are a friendly tutor named Konvo, helping a student learn and explore a topic in {{language}}.",
};

const TASK_INSTRUCTIONS: Record<ActivityType, string> = {
  assessment: `Your role:
1. Have a natural conversation to understand their thinking
2. Ask follow-up questions to gauge depth of understanding
3. Help them elaborate if they're stuck, but don't give away the answer`,
  learning: `Your role:
1. Explain concepts clearly and provide helpful examples
2. Encourage the student to ask questions and think critically
3. Guide them toward understanding rather than just giving answers
4. Adapt your explanations based on the student's responses`,
};

const INTERACTION_MODIFIERS: Record<InteractionType, string> = {
  voice:
    "Keep responses brief and conversational. Avoid long lists or complex formatting.",
  text_chat:
    "Your output is rendered as a plain text chat message. Keep responses concise and conversational.",
  static_text:
    "The student will submit a single written answer. You will not have a back-and-forth conversation.",
};

/**
 * Assemble the default system prompt from fragments.
 */
export function buildDefaultSystemPrompt(
  activityType: ActivityType,
  interactionType: InteractionType,
): string {
  return [
    PERSONA[activityType],
    "",
    COMMON_INSTRUCTIONS,
    "",
    TASK_INSTRUCTIONS[activityType],
    "",
    INTERACTION_MODIFIERS[interactionType],
  ].join("\n");
}

const CONVERSATION_START_FIRST: Record<ActivityType, string> = {
  assessment:
    "Speaking in {{language}}, introduce yourself as Konvo. Say we are going to do an activity today. Ask if the student is ready to start.",
  learning:
    "Speaking in {{language}}, introduce yourself as Konvo. Say we are going to explore a topic together today. Ask the student what they already know about it.",
};

const CONVERSATION_START_SUBSEQUENT: Record<ActivityType, string> = {
  assessment:
    "Speaking in {{language}}, acknowledge we're moving to the next question, then ask the student to answer it.",
  learning:
    "Speaking in {{language}}, acknowledge we're moving to the next topic, then encourage the student to share their thoughts.",
};

/**
 * Build default conversation start messages.
 */
export function buildDefaultConversationStart(
  activityType: ActivityType,
): { first_question: string; subsequent_questions: string } {
  return {
    first_question: CONVERSATION_START_FIRST[activityType],
    subsequent_questions: CONVERSATION_START_SUBSEQUENT[activityType],
  };
}

const EVALUATION_BASE_ASSESSMENT = `{{#if file_submissions}}
{{file_submissions}}

{{/if}}{{#if additional_context}}Additional context:
{{additional_context}}

{{/if}}Question: {{question_prompt}}

Evaluation Rubric:
{{rubric}}

Student's Answer:
{{answer_text}}

Please evaluate this answer according to the rubric. For each rubric item:
1. Assign points earned (0 to the maximum points for that item - do not exceed the maximum)
2. Set points_possible to match the rubric item's maximum points
3. Provide specific, constructive feedback in {{language}}

Then provide overall feedback in {{language}} that is encouraging and helps the student understand their strengths and areas for improvement.

IMPORTANT: All feedback text must be written in {{language}}.`;

const EVALUATION_BASE_LEARNING = `{{#if file_submissions}}
{{file_submissions}}

{{/if}}{{#if additional_context}}Additional context:
{{additional_context}}

{{/if}}Question: {{question_prompt}}

Evaluation Rubric:
{{rubric}}

Student's Answer:
{{answer_text}}

Please evaluate this answer with a focus on the student's learning progress. For each rubric item:
1. Assign points earned (0 to the maximum points for that item - do not exceed the maximum)
2. Set points_possible to match the rubric item's maximum points
3. Provide feedback that highlights what the student understood well and offers guidance for deeper understanding in {{language}}

Then provide overall feedback in {{language}} that encourages continued learning and suggests next steps.

IMPORTANT: All feedback text must be written in {{language}}.`;

/**
 * Build the default evaluation prompt based on activity type.
 */
export function buildDefaultEvaluationPrompt(
  activityType: ActivityType,
): string {
  return activityType === "assessment"
    ? EVALUATION_BASE_ASSESSMENT
    : EVALUATION_BASE_LEARNING;
}

/**
 * Build the full default BotPromptConfig from activity and interaction type.
 */
export function buildDefaultBotPromptConfig(
  activityType: ActivityType,
  interactionType: InteractionType,
): BotPromptConfig {
  return {
    system_prompt: buildDefaultSystemPrompt(activityType, interactionType),
    conversation_start: buildDefaultConversationStart(activityType),
  };
}

// ---------------------------------------------------------------------------
// Backwards-compatible wrappers (default to learning + voice)
// ---------------------------------------------------------------------------

/** @deprecated Use buildDefaultSystemPrompt() with explicit types */
export const DEFAULT_SYSTEM_PROMPT = buildDefaultSystemPrompt(
  "learning",
  "voice",
);

/** @deprecated Use buildDefaultConversationStart() with explicit types */
export const DEFAULT_CONVERSATION_START_FIRST =
  buildDefaultConversationStart("learning").first_question;

/** @deprecated Use buildDefaultConversationStart() with explicit types */
export const DEFAULT_CONVERSATION_START_SUBSEQUENT =
  buildDefaultConversationStart("learning").subsequent_questions;

/** @deprecated Use buildDefaultEvaluationPrompt() with explicit types */
export const DEFAULT_EVALUATION_PROMPT =
  buildDefaultEvaluationPrompt("learning");

/**
 * Get the default evaluation prompt template.
 * Teachers can customize this starting point.
 */
export function getDefaultEvaluationPrompt(): string {
  return DEFAULT_EVALUATION_PROMPT;
}

/**
 * TTS instruction that is appended server-side for voice mode only.
 * This is NOT part of the teacher-editable template.
 */
export const TTS_INSTRUCTION = `The text you generate will be used by TTS, so avoid special characters. Use colloquial, friendly language.`;

/**
 * Instructions appended transparently to every text-chat system prompt.
 * NOT part of the teacher-editable template.
 * Contains {{language}} which must be interpolated before use.
 */
export const CHAT_SYSTEM_APPENDIX = `
OUTPUT FORMAT:
Your output is rendered as a plain text chat message. Do NOT use any special characters, markdown formatting, or code blocks. Keep responses concise and conversational.

SAFETY:
The users are students. Never output anything offensive, inappropriate, or sexual. Always maintain a supportive and age-appropriate tone.

TOOL USAGE:
You have access to an end_conversation tool. You MUST call it when:
1. The student has provided an answer that covers the expected answer — call with reason "thorough"
2. The student explicitly refuses to answer or says they don't want to continue — call with reason "refusal"
When calling end_conversation, always include a polite ending message in {{language}}.`;

/**
 * Instructions appended transparently to every voice system prompt.
 * NOT part of the teacher-editable template.
 * Contains {{language}} which must be interpolated before use.
 */
export const VOICE_SYSTEM_APPENDIX = `
The text you generate will be used for text to speech conversion, so don't include any special characters or formatting. Use colloquial language and be friendly. Keep your responses very short with no more than 10 words. More conversational turns are better than longer responses from your side. For bilingual conversations, use the English words directly in the dialogue when English terms are used in the conversation instead of putting them in brackets and write the English words using English alphabet.

SAFETY:
The users are students. Never output anything offensive, inappropriate, or sexual. Always maintain a supportive and age-appropriate tone.`;

/**
 * Get the default bot prompt configuration.
 * Teachers can customize this starting point.
 */
export function getDefaultBotPromptConfig(): BotPromptConfig {
  return buildDefaultBotPromptConfig("learning", "voice");
}

/**
 * Check if a prompt template contains a specific variable
 */
export function hasVariable(
  template: string,
  variableKey: PromptVariableKey,
): boolean {
  const placeholder = PROMPT_VARIABLES[variableKey].placeholder;
  if (template.includes(placeholder)) {
    return true;
  }
  if (variableKey === "additional_context") {
    return template.includes("{{shared_context}}");
  }
  return false;
}

/**
 * Get missing required variables from a system prompt template.
 * Returns variable keys that should typically be present.
 */
export function getMissingRequiredVariables(
  systemPrompt: string,
): PromptVariableKey[] {
  const requiredVariables: PromptVariableKey[] = [
    "question_prompt",
    "rubric",
    "language",
  ];

  return requiredVariables.filter((key) => !hasVariable(systemPrompt, key));
}
