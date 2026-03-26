import OpenAI from "openai";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SubmissionAttempt, QuestionEvaluations } from "@/types/submission";
import { computeDenormalizedFields } from "@/lib/queries/submissions";
import { supportedLanguages } from "@/utils/supportedLanguages";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const evaluationSchema = {
  type: "object",
  properties: {
    rubric_scores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "string" },
          points_earned: { type: "number" },
          points_possible: { type: "number" },
          feedback: { type: "string" },
        },
        required: ["item", "points_earned", "points_possible", "feedback"],
        additionalProperties: false,
      },
    },
    overall_feedback: { type: "string" },
  },
  required: ["rubric_scores", "overall_feedback"],
  additionalProperties: false,
};

interface LLMRubricScore {
  item: string;
  points_earned: number;
  points_possible: number;
  feedback: string;
}

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
  params: BackgroundEvaluationParams
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

  const rubricText = rubric
    .map((item) => `- ${item.item} (${item.points} points)`)
    .join("\n");
  const maxScore = rubric.reduce((sum, item) => sum + item.points, 0);

  let userMessageContent: string;
  if (customEvaluationPrompt) {
    userMessageContent = customEvaluationPrompt;
  } else {
    const languageNames = Object.fromEntries(
      supportedLanguages.map((lang) => [lang.code, lang.name])
    );
    const languageName = languageNames[language] || "English";
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

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userMessageContent },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "evaluation_result",
        strict: true,
        schema: evaluationSchema,
      },
    },
  });

  const evaluationResult = JSON.parse(
    completion.choices[0].message.content || "{}"
  ) as { rubric_scores: LLMRubricScore[]; overall_feedback: string };

  const validatedRubricScores = evaluationResult.rubric_scores.map(
    (score: LLMRubricScore, index: number) => {
      const rubricItem = rubric[index];
      const pointsEarned = Math.min(
        Math.max(0, score.points_earned),
        rubricItem.points
      );
      return {
        item: score.item || rubricItem.item,
        points_earned: pointsEarned,
        points_possible: rubricItem.points,
        feedback: score.feedback || "",
      };
    }
  );

  const totalScore = validatedRubricScores.reduce(
    (sum: number, item: LLMRubricScore) => sum + item.points_earned,
    0
  );

  // Update the stub attempt in DB
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
    (a: SubmissionAttempt) => a.attempt_number === attemptNumber
  );

  if (stubIndex === -1) {
    throw new Error(`Stub attempt ${attemptNumber} not found`);
  }

  const updatedAttempt: SubmissionAttempt = {
    ...questionEvals.attempts[stubIndex],
    score: totalScore,
    max_score: maxScore,
    rubric_scores: validatedRubricScores,
    evaluation_feedback: evaluationResult.overall_feedback,
    is_evaluating: false,
    // feedback_approved stays false — teacher still needs to approve
  };

  questionEvals.attempts[stubIndex] = updatedAttempt;

  if (!questionEvals.selected_attempt) {
    const bestAttempt = questionEvals.attempts.reduce(
      (best: SubmissionAttempt, current: SubmissionAttempt) =>
        current.score > best.score ? current : best
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
    throw new Error(`Failed to save evaluation: ${updateError.message}`);
  }

  return updatedAttempt;
}
