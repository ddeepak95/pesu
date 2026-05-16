import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { assertSubmissionNotIntegrityLocked } from "@/lib/integrity/assertSubmissionNotIntegrityLocked";
import { SubmissionAttempt, QuestionEvaluations } from "@/types/submission";
import { computeDenormalizedFields } from "@/lib/queries/submissions";
import { runBackgroundEvaluation } from "@/lib/backgroundEvaluation";
import {
  catalogNotConfiguredResponse,
} from "@/lib/ai/credentials/resolveCatalogConfig";
import { getCachedResolveModelConfig } from "@/lib/ai/credentials/modelConfigCache";
import { modelMetaFromResolved } from "@/lib/ai/logging/types";
import { getLanguageModel } from "@/lib/ai/provider";
import { providerOptionsForConfig } from "@/lib/ai/providerOptions";
import { evaluateSubmission } from "@/lib/ai/evaluateSubmission";
import { getClassDbIdForAssignment } from "@/lib/assignments/assignmentClassCache";

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
        { status: 400 },
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
        { status: 500 },
      );
    }

    const assignmentId = currentSubmission.assignment_id as string | undefined;
    if (!assignmentId) {
      return NextResponse.json(
        { error: "Submission has no assignment" },
        { status: 400 },
      );
    }

    const classDbId = await getClassDbIdForAssignment(supabase, assignmentId);
    if (!classDbId) {
      return NextResponse.json(
        { error: "Assignment not found" },
        { status: 404 },
      );
    }

    let evalResolved;
    try {
      evalResolved = await getCachedResolveModelConfig({
        classDbId,
        appFunctionKey: "text.evaluation",
      });
    } catch (error) {
      const notConfigured = catalogNotConfiguredResponse(error);
      if (notConfigured) {
        return NextResponse.json(notConfigured.body, {
          status: notConfigured.status,
        });
      }
      throw error;
    }

    const evalModelConfig = evalResolved.config;
    const evalKeySource = evalResolved.keySource;

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
        { onConflict: "submission_id,question_order,attempt_number" },
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
          { onConflict: "submission_id,question_order,attempt_number" },
        );
      if (staticError) {
        console.error("Error saving static activity:", staticError);
      }
    }

    // ── Approval path ─────────────────────────────────────────────────────────
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
        evaluations as { [key: number]: QuestionEvaluations },
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
        console.error("Error saving stub attempt:", {
          message: updateError.message,
          code: updateError.code,
          details: updateError.details,
          hint: updateError.hint,
        });
        return NextResponse.json(
          { error: "Failed to save attempt" },
          { status: 500 },
        );
      }

      after(async () => {
        try {
          await runBackgroundEvaluation({
            submissionId,
            assignmentId,
            classDbId,
            questionOrder,
            attemptNumber: stubAttempt.attempt_number,
            answerText,
            questionPrompt,
            rubric,
            language,
            sharedContext,
            customEvaluationPrompt,
            modelConfig: evalModelConfig,
            keySource: evalKeySource,
          });
        } catch (err) {
          console.error("Background evaluation failed:", err);
        }
      });

      return NextResponse.json({ success: true, attempt: stubAttempt });
    }

    // ── Synchronous path (instant feedback) ───────────────────────────────────
    console.log(
      "[evaluate] Using custom evaluation prompt:",
      !!customEvaluationPrompt,
    );

    const model = getLanguageModel(evalModelConfig);

    const { validatedRubricScores, overallFeedback, totalScore } =
      await evaluateSubmission({
        model,
        providerOptions: providerOptionsForConfig(evalModelConfig),
        questionPrompt,
        answerText,
        rubric,
        language,
        sharedContext,
        customEvaluationPrompt,
        invocation: {
          appFunctionKey: "text.evaluation",
          classId: classDbId,
          assignmentId,
          submissionId,
          questionOrder,
          attemptNumber,
          model: modelMetaFromResolved(evalModelConfig, evalKeySource),
        },
      });

    const newAttempt: SubmissionAttempt = {
      attempt_number: attemptNumber,
      score: totalScore,
      max_score: maxScore,
      rubric_scores: validatedRubricScores,
      evaluation_feedback: overallFeedback,
      timestamp: new Date().toISOString(),
    };

    questionEvals.attempts = [...(questionEvals.attempts || []), newAttempt];

    if (!questionEvals.selected_attempt) {
      const bestAttempt = questionEvals.attempts.reduce((best, current) =>
        current.score > best.score ? current : best,
      );
      questionEvals.selected_attempt = bestAttempt.attempt_number;
    }

    evaluations[questionOrder] = questionEvals;

    const denormalized = computeDenormalizedFields(
      evaluations as { [key: number]: QuestionEvaluations },
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
      console.error("Error updating submission (evaluations save):", {
        message: updateError.message,
        code: updateError.code,
        details: updateError.details,
        hint: updateError.hint,
      });
      return NextResponse.json(
        { error: "Failed to save evaluation" },
        { status: 500 },
      );
    }

    console.log("Returning success response with attempt:", {
      attemptNumber: newAttempt.attempt_number,
      score: newAttempt.score,
      maxScore: newAttempt.max_score,
    });

    return NextResponse.json({ success: true, attempt: newAttempt });
  } catch (error) {
    console.error("=== Evaluation error ===");
    console.error("Error:", error);
    console.error("Stack:", error instanceof Error ? error.stack : "N/A");

    return NextResponse.json(
      {
        error: "Failed to evaluate answer",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
