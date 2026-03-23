import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { assertSubmissionNotIntegrityLocked } from "@/lib/integrity/assertSubmissionNotIntegrityLocked";
import { SubmissionAttempt, QuestionEvaluations } from "@/types/submission";
import { computeDenormalizedFields } from "@/lib/queries/submissions";
import { runBackgroundEvaluation } from "@/lib/backgroundEvaluation";
import OpenAI from "openai";
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

interface EvaluateRequestBody {
  submissionId: string;
  questionOrder: number;
  answerText: string;
  questionPrompt: string;
  rubric: Array<{ item: string; points: number }>;
  language: string;
  shared_context?: string;
  custom_evaluation_prompt?: string;
  /**
   * When true the route returns a stub attempt immediately and runs the LLM
   * via `after()` so the student's connection is never held open for the LLM.
   * When false/absent the LLM runs synchronously and a full attempt is returned.
   */
  feedback_requires_approval?: boolean;
}

interface LLMRubricScore {
  item: string;
  points_earned: number;
  points_possible: number;
  feedback: string;
}

export async function POST(request: NextRequest) {
  console.log("=== Evaluation API called ===");

  try {
    const body: EvaluateRequestBody = await request.json();

    const {
      submissionId,
      questionOrder,
      answerText,
      questionPrompt,
      rubric,
      language,
      shared_context: sharedContext,
      custom_evaluation_prompt: customEvaluationPrompt,
      feedback_requires_approval: feedbackRequiresApproval,
    } = body;

    if (
      !submissionId ||
      questionOrder === undefined ||
      !answerText ||
      !questionPrompt ||
      !rubric ||
      !language
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const maxScore = rubric.reduce((sum, item) => sum + item.points, 0);

    const supabase = await createServerSupabaseClient();
    const integrityBlock = await assertSubmissionNotIntegrityLocked(
      supabase,
      submissionId,
    );
    if (integrityBlock) {
      return integrityBlock;
    }

    // --- Fetch submission (needed by both paths) ---
    const { data: currentSubmission, error: fetchError } = await supabase
      .from("submissions")
      .select("evaluations, submission_mode, assignment_id")
      .eq("submission_id", submissionId)
      .single();

    if (fetchError || !currentSubmission) {
      console.error("Error fetching submission:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch submission" },
        { status: 500 }
      );
    }

    // Normalise evaluations (handle legacy array format)
    let evaluations = currentSubmission.evaluations as
      | { [key: number]: QuestionEvaluations }
      | Array<{ question_order: number; answer_text: string }>;

    if (Array.isArray(evaluations)) {
      const newEvals: { [key: number]: QuestionEvaluations } = {};
      evaluations.forEach((a) => {
        newEvals[a.question_order] = {
          attempts: [],
          selected_attempt: undefined,
        };
      });
      evaluations = newEvals;
    }

    const questionEvals = evaluations[questionOrder] || { attempts: [] };
    const attemptNumber = (questionEvals.attempts?.length || 0) + 1;

    // --- Save transcript (both paths need this before returning) ---
    const { error: transcriptError } = await supabase
      .from("submission_transcripts")
      .upsert(
        {
          submission_id: submissionId,
          question_order: questionOrder,
          attempt_number: attemptNumber,
          answer_text: answerText,
        },
        { onConflict: "submission_id,question_order,attempt_number" }
      );
    if (transcriptError) {
      console.error("Error saving transcript:", transcriptError);
    }

    // For static_text mode also write to static_activity
    if (currentSubmission.submission_mode === "static_text") {
      const { error: staticError } = await supabase
        .from("static_activity")
        .upsert(
          {
            submission_id: submissionId,
            assignment_id: currentSubmission.assignment_id,
            question_order: questionOrder,
            attempt_number: attemptNumber,
            content: answerText,
          },
          { onConflict: "submission_id,question_order,attempt_number" }
        );
      if (staticError) {
        console.error("Error saving static activity:", staticError);
      }
    }

    // ── Approval path ────────────────────────────────────────────────────────
    // Save a stub now, run the LLM after the response is sent so the student
    // is never blocked waiting for OpenAI.
    if (feedbackRequiresApproval) {
      const stubAttempt: SubmissionAttempt = {
        attempt_number: attemptNumber,
        score: 0,
        max_score: maxScore,
        rubric_scores: [],
        evaluation_feedback: "",
        timestamp: new Date().toISOString(),
        feedback_approved: false,
        is_evaluating: true,
      };

      questionEvals.attempts = [...(questionEvals.attempts || []), stubAttempt];
      evaluations[questionOrder] = questionEvals;

      const denormalized = computeDenormalizedFields(
        evaluations as { [key: number]: QuestionEvaluations }
      );

      const { error: updateError } = await supabase
        .from("submissions")
        .update({
          evaluations,
          ...denormalized,
          updated_at: new Date().toISOString(),
        })
        .eq("submission_id", submissionId);

      if (updateError) {
        console.error("Error saving stub attempt:", updateError);
        return NextResponse.json(
          { error: "Failed to save attempt" },
          { status: 500 }
        );
      }

      // LLM runs server-side after the response reaches the student.
      // If it fails, the stub stays with is_evaluating=true; the teacher
      // will see "Evaluation in progress" and can retry via POST /api/evaluate/process.
      after(async () => {
        try {
          await runBackgroundEvaluation({
            submissionId,
            questionOrder,
            attemptNumber: stubAttempt.attempt_number,
            answerText,
            questionPrompt,
            rubric,
            language,
            sharedContext,
            customEvaluationPrompt,
          });
        } catch (err) {
          console.error("Background evaluation failed:", err);
        }
      });

      return NextResponse.json({ success: true, attempt: stubAttempt });
    }

    // ── Synchronous path (instant feedback) ──────────────────────────────────
    // Build LLM prompt
    let userMessageContent: string;
    if (customEvaluationPrompt) {
      userMessageContent = customEvaluationPrompt;
    } else {
      const languageNames = Object.fromEntries(
        supportedLanguages.map((lang) => [lang.code, lang.name])
      );
      const languageName = languageNames[language] || "English";
      const sharedContextSection = sharedContext
        ? `Shared Context:\n${sharedContext}\n\n`
        : "";
      const rubricText = rubric
        .map((item) => `- ${item.item} (${item.points} points)`)
        .join("\n");

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

    console.log("[evaluate] Using custom evaluation prompt:", !!customEvaluationPrompt);

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

    const newAttempt: SubmissionAttempt = {
      attempt_number: attemptNumber,
      score: totalScore,
      max_score: maxScore,
      rubric_scores: validatedRubricScores,
      evaluation_feedback: evaluationResult.overall_feedback,
      timestamp: new Date().toISOString(),
    };

    questionEvals.attempts = [...(questionEvals.attempts || []), newAttempt];

    if (!questionEvals.selected_attempt) {
      const bestAttempt = questionEvals.attempts.reduce((best, current) =>
        current.score > best.score ? current : best
      );
      questionEvals.selected_attempt = bestAttempt.attempt_number;
    }

    evaluations[questionOrder] = questionEvals;

    const denormalized = computeDenormalizedFields(
      evaluations as { [key: number]: QuestionEvaluations }
    );

    const { error: updateError } = await supabase
      .from("submissions")
      .update({
        evaluations,
        ...denormalized,
        updated_at: new Date().toISOString(),
      })
      .eq("submission_id", submissionId);

    if (updateError) {
      console.error("Error updating submission:", updateError);
      return NextResponse.json(
        { error: "Failed to save evaluation" },
        { status: 500 }
      );
    }

    console.log("Returning success response with attempt:", {
      attemptNumber: newAttempt.attempt_number,
      score: newAttempt.score,
      maxScore: newAttempt.max_score,
    });

    return NextResponse.json({
      success: true,
      attempt: newAttempt,
    });
  } catch (error) {
    console.error("=== Evaluation error ===");
    console.error("Error:", error);
    console.error("Stack:", error instanceof Error ? error.stack : "N/A");

    return NextResponse.json(
      {
        error: "Failed to evaluate answer",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
