/**
 * Shared LLM evaluation helper used by both:
 *  - src/app/api/evaluate/route.ts  (synchronous path)
 *  - src/lib/backgroundEvaluation.ts  (background / after() path)
 *
 * Accepts an already-resolved LanguageModel so callers control which
 * provider and key are used (env defaults today; user config via BYOK later).
 */

import type { LanguageModelV3, SharedV3ProviderOptions } from "@ai-sdk/provider";
import { supportedLanguages } from "@/utils/supportedLanguages";
import { evaluationSchema, type LLMRubricScore } from "./schemas/evaluation";
import { generateStructured } from "./structured";

export interface EvaluateSubmissionParams {
  model: LanguageModelV3;
  providerOptions?: SharedV3ProviderOptions;
  questionPrompt: string;
  answerText: string;
  rubric: Array<{ item: string; points: number }>;
  language: string;
  sharedContext?: string;
  customEvaluationPrompt?: string;
}

export interface ValidatedRubricScore {
  item: string;
  points_earned: number;
  points_possible: number;
  feedback: string;
}

export interface EvaluationOutput {
  validatedRubricScores: ValidatedRubricScore[];
  overallFeedback: string;
  totalScore: number;
  maxScore: number;
}

export async function evaluateSubmission(
  params: EvaluateSubmissionParams,
): Promise<EvaluationOutput> {
  const {
    model,
    questionPrompt,
    answerText,
    rubric,
    language,
    sharedContext,
    customEvaluationPrompt,
    providerOptions,
  } = params;

  const maxScore = rubric.reduce((sum, item) => sum + item.points, 0);
  const rubricText = rubric
    .map((item) => `- ${item.item} (${item.points} points)`)
    .join("\n");

  const languageNames = Object.fromEntries(
    supportedLanguages.map((lang) => [lang.code, lang.name]),
  );
  const languageName = languageNames[language] || "English";

  let userMessageContent: string;
  if (customEvaluationPrompt) {
    userMessageContent = customEvaluationPrompt;
  } else {
    const sharedContextSection = sharedContext
      ? `Additional context:\n${sharedContext}\n\n`
      : "";
    userMessageContent = `${sharedContextSection}Question: ${questionPrompt}

Evaluation Rubric:
${rubricText}

Student's Answer:
${answerText}

Please evaluate this answer according to the rubric. For each rubric item:
1. Assign points earned (0 to the maximum points for that item - do not exceed the maximum)
2. Set points_possible to match the rubric item's maximum points
3. Provide specific, constructive feedback in ${languageName}

Then provide overall feedback in ${languageName} that is encouraging and helps the student understand their strengths and areas for improvement.

IMPORTANT: All feedback text must be written in ${languageName}.`;
  }

  const systemMessage = `You are an expert educational evaluator. Your task is to grade student responses based on provided rubric criteria. Be fair, constructive, and encouraging in your feedback. Evaluate based solely on the content of the student's answer.

OUTPUT FORMAT:
All feedback text (per-rubric feedback and overall_feedback) is displayed as plain text to students. Do NOT use any special characters, markdown formatting, or code blocks in feedback. Keep feedback concise, clear, and constructive.

SAFETY:
The users are students. All feedback must be age-appropriate, supportive, and respectful. Never include anything offensive, inappropriate, or sexual in your evaluation feedback.`;

  const evaluationResult = await generateStructured({
    model,
    schema: evaluationSchema,
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userMessageContent },
    ],
    providerOptions,
  });

  const validatedRubricScores = evaluationResult.rubric_scores.map(
    (score: LLMRubricScore, index: number) => {
      const rubricItem = rubric[index];
      const pointsEarned = Math.min(
        Math.max(0, score.points_earned),
        rubricItem.points,
      );
      return {
        item: score.item || rubricItem.item,
        points_earned: pointsEarned,
        points_possible: rubricItem.points,
        feedback: score.feedback || "",
      };
    },
  );

  const totalScore = validatedRubricScores.reduce(
    (sum, item) => sum + item.points_earned,
    0,
  );

  return {
    validatedRubricScores,
    overallFeedback: evaluationResult.overall_feedback,
    totalScore,
    maxScore,
  };
}
