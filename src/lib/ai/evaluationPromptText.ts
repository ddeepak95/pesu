/**
 * Pure, deterministic evaluation user-message text — extracted from
 * evaluateSubmission.ts so it can be reused by the template-editor prompt
 * preview (client-side) without pulling in the AI SDK / model-calling code
 * that lives alongside it there.
 */

export interface DefaultEvaluationUserMessageInput {
  questionPrompt: string;
  rubric: Array<{ item: string; points: number }>;
  answerText: string;
  languageName: string;
  sharedContext?: string;
}

/** Built-in evaluation user message, used when no custom evaluation prompt is set. */
export function buildDefaultEvaluationUserMessage(
  input: DefaultEvaluationUserMessageInput,
): string {
  const { questionPrompt, rubric, answerText, languageName, sharedContext } =
    input;

  const rubricText = rubric
    .map((item) => `- ${item.item} (${item.points} points)`)
    .join("\n");

  const sharedContextSection = sharedContext
    ? `Additional context:\n${sharedContext}\n\n`
    : "";

  return `${sharedContextSection}Question: ${questionPrompt}

Evaluation Rubric:
${rubricText}

Student's Answer:
${answerText}

Please evaluate this answer according to the rubric.

Write all feedback text — per-item and the overall feedback output — in ${languageName}.`;
}

/**
 * Teacher "Feedback focus" areas steer the AI's sections. Appended regardless
 * of whether a custom evaluation prompt is in use.
 */
export function appendFeedbackFocusBlock(
  base: string,
  feedbackFocus?: string,
): string {
  if (!feedbackFocus || !feedbackFocus.trim()) return base;
  return `${base}\n\nFEEDBACK FOCUS (from the teacher): Create one feedback_output "section" per focus area below, using the exact given title as that section's title and addressing its guidance in the section's content. Cover every area; you may add other sections too if helpful.\n${feedbackFocus.trim()}`;
}
