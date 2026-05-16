import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SubmissionAttempt, QuestionEvaluations } from "@/types/submission";
import { computeDenormalizedFields } from "@/lib/queries/submissions";
import type { ResolvedModelConfig } from "@/lib/ai/config";
import { AiNotConfiguredError } from "@/lib/ai/credentials/resolve";
import { getLanguageModel } from "@/lib/ai/provider";
import { providerOptionsForConfig } from "@/lib/ai/providerOptions";
import { evaluateSubmission } from "@/lib/ai/evaluateSubmission";

export interface BackgroundEvaluationParams {
  submissionId: string;
  questionOrder: number;
  attemptNumber: number;
  answerText: string;
  questionPrompt: string;
  rubric: Array<{ item: string; points: number }>;
  language: string;
  sharedContext?: string;
  customEvaluationPrompt?: string;
  modelConfig: ResolvedModelConfig;
}

/**
 * Runs the LLM evaluation and updates the stub attempt (created by the submit
 * endpoint) with the real scores and feedback.  Sets is_evaluating = false
 * when done so the teacher approval UI becomes active.
 *
 * Designed to run server-side after the HTTP response is already sent
 * (e.g. via Next.js `after()`).
 */
export async function runBackgroundEvaluation(
  params: BackgroundEvaluationParams,
): Promise<SubmissionAttempt> {
  const {
    submissionId,
    questionOrder,
    attemptNumber,
    answerText,
    questionPrompt,
    rubric,
    language,
    sharedContext,
    customEvaluationPrompt,
  } = params;

  if (!params.modelConfig) {
    throw new AiNotConfiguredError();
  }
  const model = getLanguageModel(params.modelConfig);

  const { validatedRubricScores, overallFeedback, totalScore, maxScore } =
    await evaluateSubmission({
      model,
      providerOptions: providerOptionsForConfig(params.modelConfig),
      questionPrompt,
      answerText,
      rubric,
      language,
      sharedContext,
      customEvaluationPrompt,
    });

  const supabase = await createServerSupabaseClient();

  const { data: currentSubmission, error: fetchError } = await supabase
    .from("submissions")
    .select("evaluations")
    .eq("submission_id", submissionId)
    .single();

  if (fetchError || !currentSubmission) {
    throw new Error(`Failed to fetch submission: ${fetchError?.message}`);
  }

  const evaluations = currentSubmission.evaluations as {
    [key: number]: QuestionEvaluations;
  };
  const questionEvals = evaluations[questionOrder];

  if (!questionEvals) {
    throw new Error("Question evaluations not found");
  }

  const stubIndex = questionEvals.attempts.findIndex(
    (a: SubmissionAttempt) => a.attempt_number === attemptNumber,
  );

  if (stubIndex === -1) {
    throw new Error(`Stub attempt ${attemptNumber} not found`);
  }

  const updatedAttempt: SubmissionAttempt = {
    ...questionEvals.attempts[stubIndex],
    score: totalScore,
    max_score: maxScore,
    rubric_scores: validatedRubricScores,
    evaluation_feedback: overallFeedback,
    is_evaluating: false,
    // feedback_approved stays false — teacher still needs to approve
  };

  questionEvals.attempts[stubIndex] = updatedAttempt;

  if (!questionEvals.selected_attempt) {
    const bestAttempt = questionEvals.attempts.reduce(
      (best: SubmissionAttempt, current: SubmissionAttempt) =>
        current.score > best.score ? current : best,
    );
    questionEvals.selected_attempt = bestAttempt.attempt_number;
  }

  evaluations[questionOrder] = questionEvals;
  const denormalized = computeDenormalizedFields(evaluations);

  const { error: updateError } = await supabase
    .from("submissions")
    .update({
      evaluations,
      ...denormalized,
      updated_at: new Date().toISOString(),
    })
    .eq("submission_id", submissionId);

  if (updateError) {
    console.error("Background evaluation: failed to update submissions", {
      submissionId,
      questionOrder,
      message: updateError.message,
      code: updateError.code,
      details: updateError.details,
      hint: updateError.hint,
    });
    throw new Error(`Failed to save evaluation: ${updateError.message}`);
  }

  return updatedAttempt;
}
