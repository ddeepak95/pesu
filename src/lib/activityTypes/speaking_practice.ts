import type { ActivityTypeDefinition, ActivityTypeLabels } from "./types";

const SPEAKING_SYSTEM_PROMPT = `You are Konvo, a friendly conversation partner helping a student practice speaking in {{language}} through a realistic scenario.

The title of the speaking practice is: {{title}}

{{#if instructions}}
The instructions for the activity shared to the student are:
{{instructions}}
{{/if}}

{{#if context_for_ai}}
Here is the scenario context:
{{context_for_ai}}
{{/if}}

{{#if file_submissions}}
The student has uploaded the following files. Use them as part of the scenario.
{{file_submissions}}
{{/if}}

Set up and play out this speaking scenario with the student:
{{question_prompt}}

Over the course of the conversation, naturally guide the student to cover these aspects:
{{rubric}}

{{#if expected_answer}}
Additional scenario context (for your reference only, do NOT reveal to the student). Strictly follow this for your role-play:
{{expected_answer}}
{{/if}}

Your role:
1. Stay in character and keep the scenario realistic and engaging
2. Speak in short, natural turns and give the student plenty of room to talk`;

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

Please review this speaking practice with primary emphasis on actionable feedback (scores are secondary).

For each aspect:
1. Assign points_earned generously: reward partial effort and good-faith attempts; prefer the upper part of the range when the student addressed the aspect reasonably, and only deduct meaningfully for clear gaps (0 to the maximum for that aspect - do not exceed the maximum)
2. Set points_possible to match the aspect's maximum points
3. In {{language}}, write feedback that (a) briefly acknowledges what worked, if anything, (b) states specifically what the speaker did wrong or missed for this aspect, tied to the transcript, and (c) gives a concrete correction—what to say or do differently next time

Then compose the feedback output in {{language}} using the same pattern: brief positives, then what went wrong or was weak across the conversation, then clear steps to improve on the next attempt. Reference specific moments from the transcript. Keep a supportive tone; prioritize teaching over judging.

IMPORTANT: All feedback text must be written in {{language}}.
{{#if support_language}}
LANGUAGE OVERRIDE: The learner had {{support_language}} available as a support language. Write ALL feedback (both per-aspect and overall) in {{support_language}} instead of {{language}}.
{{/if}}`;

const SPEAKING_EVALUATION_SYSTEM_PERSONA = `You are a supportive speaking coach reviewing a role-play conversation. Your main job is actionable feedback, not strict grading. Score generously when the student made a good-faith attempt. For each rubric item and in overall feedback, name what the speaker did wrong or missed and give a concrete correction (what to say or do next time). Evaluate only from the transcript.`;

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

export const SPEAKING_PRACTICE_DEFINITION: ActivityTypeDefinition = {
  kind: "speaking_practice",
  label: "Speaking Practice",
  systemPrompt: SPEAKING_SYSTEM_PROMPT,
  conversationStart: {
    first_question:
      "Introduce yourself as Konvo and set the scene for this speaking scenario, then ask if the student is ready to begin. {{#if support_language}}Deliver this entire opening in {{support_language}}: explain the scenario and what the student should try to do/cover, and ask if they are ready. Do NOT start the role-play yet — once they confirm, conduct the role-play itself in {{language}}.{{/if}}",
    subsequent_questions:
      "Briefly set the scene for the next speaking scenario, then ask if the student is ready to begin. {{#if support_language}}Deliver this entire opening in {{support_language}}: explain the new scenario and what the student should try to do/cover, and ask if they are ready. Do NOT start the role-play yet — once they confirm, conduct the role-play itself in {{language}}.{{/if}}",
  },
  evaluationPrompt: SPEAKING_EVALUATION,
  evaluationSystemPersona: SPEAKING_EVALUATION_SYSTEM_PERSONA,
  labels: SPEAKING_LABELS,
  defaultFeedbackFocusAreas: [
    {
      title: "Pronunciation & fluency",
      description:
        "Comment on clarity of pronunciation, pacing, and how smoothly the student spoke.",
    },
    {
      title: "Vocabulary & grammar",
      description:
        "Note vocabulary range and grammatical accuracy, with specific corrections.",
    },
    {
      title: "Task completion",
      description:
        "Assess how well the student covered the scenario's target aspects.",
    },
    {
      title: "Next steps",
      description:
        "Give concrete suggestions to improve on the next attempt.",
    },
  ],
  defaults: {
    interactionType: "multimodal",
    multimodal: { languageSupportEnabled: true, availableActions: [] },
    display: { useStarDisplay: true },
  },
  generation: {
    rubricCoverage:
      "the distinct aspects the learner must cover while speaking through the scenario — concrete conversational moves or sub-goals (e.g. for ordering food: asking for the menu, understanding the names of dishes, asking the price, saying thank you)",
    expectedAnswerCoverage:
      "for each aspect, how the tutor should guide the conversation and what kind of responses are expected from the learner — the conversational guidance an evaluator would use to judge whether the learner handled that aspect well",
    guidance:
      "This is a SPEAKING-PRACTICE role-play scenario, not a written question. Frame the rubric items as the distinct conversational aspects the learner must cover while speaking. For the conversation-guidance field, describe — aspect by aspect — how the tutor should steer the dialogue and the responses expected from the learner, not a written model answer.",
    dynamicGenerationGuidance: `
- Phrase each generated prompt as a scenario setup for the tutor to role-play, not a question to answer — describe the setting, the tutor's role, and the learner's role.
- Ground the scenario in the student's submitted files where relevant (e.g. a scenario brief or context document), but the prompt itself must describe a spoken role-play, not a written task.
- Keep the scenario description in plain prose — avoid Markdown formatting, since this prompt is read aloud to set up the role-play, not displayed on screen.`,
  },
  languageSupportDirective:
    "LANGUAGE SUPPORT: {{support_language}} help is available. If the learner explicitly asks " +
    "for it mid-scenario or speaks in {{support_language}}, stay in character and reply that " +
    "turn in {{support_language}} (proper nouns and scenario terms stay in {{language}}); " +
    "never offer unprompted. Otherwise stay in character in {{language}}.",
  endConditionInstruction:
    "the learner has completed the scenario's target aspects through the role-play, or has " +
    "explicitly refused to continue the scenario.",
};
