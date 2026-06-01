/**
 * Shared LLM evaluation helper used by both:
 *  - src/app/api/evaluate/route.ts  (synchronous path)
 *  - src/lib/backgroundEvaluation.ts  (background / after() path)
 *
 * Accepts an already-resolved LanguageModel so callers control which
 * provider and key are used (env defaults today; user config via BYOK later).
 */

import type { LanguageModelV3, SharedV3ProviderOptions } from "@ai-sdk/provider";
import { buildEvaluationSystemMessage } from "@/lib/activityTypes/registry";
import type { ActivityTypeKind } from "@/lib/activityTypes/types";
import { supportedLanguages } from "@/utils/supportedLanguages";
import { evaluationSchema, type LLMRubricScore } from "./schemas/evaluation";
import { generateStructured } from "./structured";
import type { StartAiInvocationInput } from "./logging/types";

export interface EvaluateSubmissionParams {
  model: LanguageModelV3;
  providerOptions?: SharedV3ProviderOptions;
  questionPrompt: string;
  answerText: string;
  rubric: Array<{ item: string; points: number }>;
  language: string;
  sharedContext?: string;
  customEvaluationPrompt?: string;
  activityType?: ActivityTypeKind;
  invocation?: Omit<StartAiInvocationInput, "sdkRequest" | "retryOf" | "retryIndex">;
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
    activityType,
    providerOptions,
    invocation,
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

  const systemMessage = buildEvaluationSystemMessage(
    activityType ?? "learning",
  );

  const evaluationResult = await generateStructured({
    model,
    schema: evaluationSchema,
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userMessageContent },
    ],
    providerOptions,
    invocation: invocation
      ? { ...invocation, schemaName: "evaluationSchema" }
      : undefined,
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
