import {
  BotPromptConfig,
  DynamicGenerationSpec,
  Question,
  teacherPromptOrFocus,
} from "@/types/assignment";
import { getActivityTypeDefinition } from "@/lib/activityTypes/registry";
import type { ActivityTypeDefinition, ActivityTypeKind } from "@/lib/activityTypes/types";

/**
 * Supported variable placeholders for prompt templates.
 * These can be inserted into system prompts and conversation start messages.
 */
export const PROMPT_VARIABLES = {
  title: {
    placeholder: "{{title}}",
    description: "The assignment title",
    category: "static" as const,
  },
  instructions: {
    placeholder: "{{instructions}}",
    description: "Student instructions for the assignment",
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
  context_for_ai: {
    placeholder: "{{context_for_ai}}",
    description:
      "Contextual information for AI; stored as shared_context in the DB",
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
  max_attempts: {
    placeholder: "{{max_attempts}}",
    description: "Maximum allowed attempts",
    category: "static" as const,
  },
  language: {
    placeholder: "{{language}}",
    description: "The selected language name (e.g., English, Tamil)",
    category: "static" as const,
  },
  support_language: {
    placeholder: "{{support_language}}",
    description:
      "The learner's selected support language (a secondary language the tutor may use to help / write feedback in); empty when none is configured/selected",
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
  generation_spec: {
    placeholder: "{{generation_spec}}",
    description:
      "Per-question points, dynamic flags, and question or guidelines text for file-based generation",
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

/** Re-exported from the activity-type registry (single source of truth). */
export type ActivityType = ActivityTypeKind;
export type InteractionType =
  | "voice"
  | "text_chat"
  | "static_text"
  | "multimodal";

const COMMON_INSTRUCTIONS = `Guidelines:
- Conduct the conversation in {{language}}
- Be encouraging and supportive
- Keep your questions and responses short and concise`;

const INTERACTION_MODIFIERS: Record<InteractionType, string> = {
  voice:
    "Keep responses brief and conversational.",
  text_chat:
    "Keep responses concise and conversational.",
  static_text:
    "The student will submit a single written answer. You will not have a back-and-forth conversation.",
  multimodal:
    "Use a multimodal, conversational style and adapt to changing context naturally.",
};

/**
 * Assemble the default system prompt from fragments.
 */
export function buildDefaultSystemPrompt(
  activityType: ActivityType,
  interactionType: InteractionType,
): string {
  const def = getActivityTypeDefinition(activityType);
  return [
    def.systemPrompt,
    "",
    COMMON_INSTRUCTIONS,
    "",
    INTERACTION_MODIFIERS[interactionType],
  ].join("\n");
}

/**
 * Build default conversation start messages.
 */
export function buildDefaultConversationStart(
  activityType: ActivityType,
): { first_question: string; subsequent_questions: string } {
  const { conversationStart } = getActivityTypeDefinition(activityType);
  return {
    first_question: conversationStart.first_question,
    subsequent_questions: conversationStart.subsequent_questions,
  };
}

/**
 * Build the default evaluation prompt based on activity type.
 */
export function buildDefaultEvaluationPrompt(
  activityType: ActivityType,
): string {
  return getActivityTypeDefinition(activityType).evaluationPrompt;
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

// ---------------------------------------------------------------------------
// Dynamic question generation prompt
// ---------------------------------------------------------------------------

/** Human-readable block for {{generation_spec}} interpolation (legacy global spec). */
export function formatGenerationSpecForPrompt(spec: DynamicGenerationSpec): string {
  return [
    `Generate exactly ${spec.question_count} question(s).`,
    `Each question is worth ${spec.points_per_question} points; each question's rubric must sum to exactly ${spec.points_per_question} points.`,
    `What the questions should cover:`,
    spec.coverage_description.trim(),
  ].join("\n");
}

/** Per-question instructions for {{generation_spec}} when using assignment.questions[]. */
export function formatQuestionsForDynamicGenerationPrompt(questions: Question[]): string {
  const sorted = [...questions].sort((a, b) => a.order - b.order);
  return sorted
    .map((q, i) => {
      const lines = [
        `--- Question ${i} (question_index=${i}) ---`,
        `Total points: ${q.total_points}`,
        `dynamic_prompt: ${q.dynamic_prompt ? "true (generate the student-facing question from the teacher's guidelines + files)" : "false (teacher question text is final; echo it in output or match it)"}`,
        `dynamic_rubric: ${q.dynamic_rubric ? "true (generate rubric + expected_answer for this question from files; rubric must sum to total points)" : "false (teacher rubric and expected_answer are final for this index — still output placeholder strings if required by schema; server will substitute)"}`,
      ];
      if (q.dynamic_prompt) {
        lines.push(
          `Guidelines for the question (teacher): ${teacherPromptOrFocus(q).trim() || "(empty)"}`,
        );
      } else {
        lines.push(
          `Fixed question (teacher): ${teacherPromptOrFocus(q).trim() || "(empty)"}`,
        );
      }
      if (!q.dynamic_rubric) {
        lines.push(
          `Fixed rubric (teacher): ${JSON.stringify(q.rubric)}`,
          `Fixed expected answer (teacher): ${(q.expected_answer ?? "").trim()}`,
        );
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

/**
 * Default system prompt template for dynamic question generation.
 * Uses template variables that are interpolated server-side.
 * Pass an ActivityTypeDefinition to append type-specific generation guidance.
 */
export function buildDefaultDynamicGenerationPrompt(activityDef?: ActivityTypeDefinition): string {
  const typeGuidance = activityDef?.generation?.dynamicGenerationGuidance ?? "";
  return `You are an expert educational content creator. You will output one structured entry per assignment question (see generation_spec). Use the student's file submission to generate any fields marked dynamic; respect teacher-fixed text where indicated.

{{#if title}}
==========
Assignment Title: {{title}}
==========
{{/if}}
{{#if instructions}}
==========
Instructions: {{instructions}}
==========
{{/if}}
{{#if context_for_ai}}
==========
Additional Context: {{context_for_ai}}
==========
{{/if}}
==========
Per-question generation requirements:
{{generation_spec}}
==========
Student's File Submission:
{{file_submissions}}
==========
Rules:
- For each index, produce prompt, rubric, and expected_answer in the structured output
- Where dynamic_prompt is true: write a clear student-facing question grounded in the files and the teacher's guidelines for the question
- Where dynamic_prompt is false: set prompt to align with the teacher's fixed question text
- Where dynamic_rubric is true: create 3-5 rubric items that sum to exactly the total points for that question; expected_answer lists key points for evaluation
- Where dynamic_rubric is false: still output rubric and expected_answer fields, but they will be replaced server-side — you may repeat the teacher's fixed content
- Questions should be distinct from each other — avoid overlap
- Set question_index to the 0-based index of each question (0 through N-1)
- Format the generated prompt using Markdown when the submission contains code${typeGuidance}`;
}

const GENERATION_PROMPT_VARIABLE_KEYS: PromptVariableKey[] = [
  "title",
  "instructions",
  "context_for_ai",
  "file_submissions",
  "generation_spec",
];

/**
 * Get only the variables relevant to the dynamic question generation prompt.
 * Excludes per-question and per-attempt variables that don't exist at generation time.
 */
export function getVariablesForGenerationPrompt() {
  return GENERATION_PROMPT_VARIABLE_KEYS.map((key) => ({
    key,
    ...PROMPT_VARIABLES[key],
  }));
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
  if (variableKey === "context_for_ai") {
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
