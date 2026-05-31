/**
 * Activity-type registry — the single source of truth for activity types.
 *
 * Pure / client-safe: no server-only imports. The prompt builders
 * (`promptTemplates.ts`), the teacher form, the Question Card, and the server
 * multimodal directive builder (`chat-stream-object.ts`) all read this registry,
 * so a new activity type is added here once. See docs/adding-activity-types.md.
 *
 * `learning` and `assessment` carry the exact prompt text previously hardcoded
 * in `promptTemplates.ts`, so their behavior is unchanged.
 */

import type {
  ActivityTypeDefinition,
  ActivityTypeKind,
  ActivityTypeLabels,
} from "./types";
import { DEFAULT_ACTIVITY_TYPE_LABELS } from "./types";

// ── learning ────────────────────────────────────────────────────────────────
const LEARNING_PERSONA = `You are a friendly tutor named Konvo, helping a student learn and explore a topic in {{language}}.

The title of the activity is: {{title}}

{{#if instructions}}
The instructions for the activity shared to the student are:
{{instructions}}
{{/if}}

{{#if context_for_ai}}
Here is the activity context:
{{context_for_ai}}
{{/if}}
`;

const LEARNING_TASK = `{{#if file_submissions}}
The student has uploaded the following files. Use this as part of the activity.
{{file_submissions}}
{{/if}}

The student needs to answer this question:
{{question_prompt}}

Use the following rubric to guide the student's learning.
{{rubric}}

{{#if expected_answer}}
Expected answer guidance (for your reference only, do NOT reveal to the student):
{{expected_answer}}
{{/if}}

Your role:
1. Explain concepts clearly and provide helpful examples
2. Encourage the student to ask questions and think critically
3. Guide them toward understanding rather than just giving answers
4. Adapt your explanations based on the student's responses`;

const LEARNING_EVALUATION = `
The title of the activity is: {{title}}
{{#if instructions}}
The instructions for the activity shared to the student are:
{{instructions}}
{{/if}}
{{#if context_for_ai}}
Here is the activity context provided by the teacher:
{{context_for_ai}}
{{/if}}
{{#if file_submissions}}
The student has uploaded the following files as submission:
{{file_submissions}}
{{/if}}

Question: {{question_prompt}}

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

// ── assessment ───────────────────────────────────────────────────────────────
const ASSESSMENT_PERSONA = `You are a teacher assistant named Konvo, conducting assessment with a student in {{language}}.

The title of the assessment is: {{title}}

{{#if instructions}}
The instructions for the assessment shared to the student are:
{{instructions}}
{{/if}}

{{#if context_for_ai}}
Here is the additional assessment context:
{{context_for_ai}}
{{/if}}
`;

const ASSESSMENT_TASK = `{{#if file_submissions}}
The student has uploaded the following files as submission:
{{file_submissions}}

The questions need to be asked based on the submission and the context provided.
{{/if}}

The student needs to answer this question:
{{question_prompt}}

They will be evaluated based on the following criteria. Make sure to cover all the criteria in your interaction.
{{rubric}}

Your role:
1. Have a natural conversation to understand their thinking
2. Ask follow-up questions to gauge depth of understanding
3. Never give away the answer`;

const ASSESSMENT_EVALUATION = `
The title of the assessment is: {{title}}
{{#if instructions}}
The instructions for the assessment shared to the student are:
{{instructions}}
{{/if}}
{{#if context_for_ai}}
Here is the assessment context provided by the teacher:
{{context_for_ai}}
{{/if}}
{{#if file_submissions}}
The student has uploaded the following files as submission:
{{file_submissions}}
{{/if}}

Question: {{question_prompt}}

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

// ── speaking_practice ────────────────────────────────────────────────────────
const SPEAKING_PERSONA = `You are Konvo, a friendly conversation partner helping a student practice speaking in {{language}} through a realistic scenario.

The title of the speaking practice is: {{title}}

{{#if instructions}}
The instructions for the activity shared to the student are:
{{instructions}}
{{/if}}

{{#if context_for_ai}}
Here is the scenario context:
{{context_for_ai}}
{{/if}}
`;

const SPEAKING_TASK = `{{#if file_submissions}}
The student has uploaded the following files. Use them as part of the scenario.
{{file_submissions}}
{{/if}}

Set up and play out this speaking scenario with the student:
{{question_prompt}}

Over the course of the conversation, naturally guide the student to cover these aspects. Do not read them out as a checklist — weave them into the role-play:
{{rubric}}

{{#if expected_answer}}
Additional scenario context (for your reference only, do NOT reveal to the student):
{{expected_answer}}
{{/if}}

Your role:
1. Stay in character and keep the scenario realistic and engaging
2. Speak in short, natural turns and give the student plenty of room to talk
3. Gently steer the conversation so each aspect comes up, without lecturing
4. Encourage the student and help them keep the conversation going in {{language}}`;

const SPEAKING_EVALUATION = `
The title of the speaking practice is: {{title}}
{{#if instructions}}
The instructions for the activity shared to the student are:
{{instructions}}
{{/if}}
{{#if context_for_ai}}
Here is the scenario context provided by the teacher:
{{context_for_ai}}
{{/if}}
{{#if file_submissions}}
The student has uploaded the following files as submission:
{{file_submissions}}
{{/if}}

Scenario: {{question_prompt}}

Aspects to cover in the scenario:
{{rubric}}

Student's spoken responses:
{{answer_text}}

Please evaluate how well the student handled the speaking scenario. For each aspect:
1. Assign points earned (0 to the maximum points for that aspect - do not exceed the maximum)
2. Set points_possible to match the aspect's maximum points
3. Provide specific, constructive feedback in {{feedback_language}} on how well the student covered the aspect and communicated within the scenario

Then provide overall feedback in {{feedback_language}} that is encouraging and helps the student improve their speaking and communication.

IMPORTANT: All feedback text must be written in {{feedback_language}}.`;

const SPEAKING_LABELS: Partial<ActivityTypeLabels> = {
  question: "Scenario",
  questionPlaceholder: "Describe the speaking scenario the student will role-play",
  rubric: "Aspects to cover",
  rubricItemPlaceholder: "An aspect the learner should cover (e.g. ask for the menu)",
  rubricItemNoun: "Aspect",
  expectedAnswer: "Conversation guidance & expected responses",
  expectedAnswerPlaceholder:
    "Describe how the tutor should guide the conversation and the kind of responses expected from the learner for these aspects (optional)",
  expectedAnswerHelp:
    "How the tutor should guide the conversation and the responses expected from the learner for each aspect. Guides AI evaluation; not shown to learners.",
  questionNoun: "scenario",
};

export const ACTIVITY_TYPE_REGISTRY: Record<
  ActivityTypeKind,
  ActivityTypeDefinition
> = {
  learning: {
    kind: "learning",
    label: "Learning",
    persona: LEARNING_PERSONA,
    taskInstructions: LEARNING_TASK,
    conversationStart: {
      first_question:
        "Speaking in {{language}}, introduce yourself as Konvo. Say we are going to explore a topic together today. Ask if the student is ready to start. If they are ready, start the activity.",
      subsequent_questions:
        "Speaking in {{language}}, acknowledge we're moving to the next topic, then start the next topic.",
    },
    evaluationPrompt: LEARNING_EVALUATION,
    labels: {},
  },
  assessment: {
    kind: "assessment",
    label: "Assessment",
    persona: ASSESSMENT_PERSONA,
    taskInstructions: ASSESSMENT_TASK,
    conversationStart: {
      first_question:
        "Speaking in {{language}}, introduce yourself as Konvo. Say you are going to conduct an assessment with them. Ask if the student is ready to start. If they are ready, start the assessment.",
      subsequent_questions:
        "Speaking in {{language}}, acknowledge we're moving to the next question, then ask the student to answer it.",
    },
    evaluationPrompt: ASSESSMENT_EVALUATION,
    labels: {},
  },
  speaking_practice: {
    kind: "speaking_practice",
    label: "Speaking Practice",
    persona: SPEAKING_PERSONA,
    taskInstructions: SPEAKING_TASK,
    conversationStart: {
      first_question:
        "Speaking in {{language}}, introduce yourself as Konvo and briefly set the scene for the speaking scenario. Invite the student into the role-play and ask if they are ready to begin.",
      subsequent_questions:
        "Speaking in {{language}}, briefly transition into the next scenario and set the scene, then invite the student to begin.",
    },
    evaluationPrompt: SPEAKING_EVALUATION,
    evaluationFeedbackLanguage: "support",
    labels: SPEAKING_LABELS,
    defaults: {
      interactionType: "multimodal",
      multimodal: { languageSupportEnabled: true, availableActions: [] },
    },
    generation: {
      rubricCoverage:
        "the distinct aspects the learner must cover while speaking through the scenario — concrete conversational moves or sub-goals (e.g. for ordering food: asking for the menu, understanding the names of dishes, asking the price, saying thank you)",
      expectedAnswerCoverage:
        "for each aspect, how the tutor should guide the conversation and what kind of responses are expected from the learner — the conversational guidance an evaluator would use to judge whether the learner handled that aspect well",
      guidance:
        "This is a SPEAKING-PRACTICE role-play scenario, not a written question. Frame the rubric items as the distinct conversational aspects the learner must cover while speaking. For the conversation-guidance field, describe — aspect by aspect — how the tutor should steer the dialogue and the responses expected from the learner, not a written model answer.",
    },
    buildMultimodalDirective: () =>
      "SPEAKING PRACTICE: You are a role-play partner in a speaking scenario, not a " +
      "quizmaster. Stay in character, keep your spoken turns short and natural, and let " +
      "the student do most of the talking. Draw out the scenario's target aspects through " +
      "the flow of the conversation rather than asking about them directly.",
    buildLanguageSupportActiveDirective: ({ languageLabel, primaryLanguageLabel }) =>
      `LANGUAGE SUPPORT — CONTINUE IN ${languageLabel.toUpperCase()}: The student asked ` +
      `for help in ${languageLabel}. For this response, stay in character and continue the ` +
      `speaking scenario naturally in ${languageLabel}, helping them understand and keep ` +
      `going. ` +
      (primaryLanguageLabel
        ? `Keep proper nouns and any scenario-specific terms from ${primaryLanguageLabel} as they were. `
        : "") +
      `Resume in the usual language on the next turn.`,
  },
};

export function getActivityTypeDefinition(
  kind: ActivityTypeKind,
): ActivityTypeDefinition {
  return ACTIVITY_TYPE_REGISTRY[kind] ?? ACTIVITY_TYPE_REGISTRY.learning;
}

/** All activity types in dropdown order. */
export function listActivityTypes(): ActivityTypeDefinition[] {
  return Object.values(ACTIVITY_TYPE_REGISTRY);
}

/**
 * Resolve the language the evaluation feedback should be written in. Returns the
 * support language when the activity type requests it and one is available;
 * otherwise the primary (conversation) language.
 */
export function resolveFeedbackLanguageCode(
  kind: ActivityTypeKind,
  primaryLanguageCode: string,
  supportLanguageCode?: string,
): string {
  const def = getActivityTypeDefinition(kind);
  if (def.evaluationFeedbackLanguage === "support" && supportLanguageCode) {
    return supportLanguageCode;
  }
  return primaryLanguageCode;
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
