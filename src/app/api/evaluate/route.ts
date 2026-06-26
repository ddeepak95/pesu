import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase-server";
import { assertSubmissionNotIntegrityLocked } from "@/lib/integrity/assertSubmissionNotIntegrityLocked";
import {
  catalogNotConfiguredResponse,
} from "@/lib/ai/credentials/resolveCatalogConfig";
import { getCachedResolveModelConfig } from "@/lib/ai/credentials/modelConfigCache";
import { modelMetaFromResolved } from "@/lib/ai/logging/types";
import { getLanguageModel } from "@/lib/ai/provider";
import { providerOptionsForConfig } from "@/lib/ai/providerOptions";
import { evaluateSubmission } from "@/lib/ai/evaluateSubmission";
import {
  getActivityTypeForAssignment,
  getClassDbIdForAssignment,
} from "@/lib/assignments/assignmentClassCache";

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
   * When true the AI grade is written as a tentative per-attempt result (held —
   * not counted toward the submission total) until the teacher releases. When
   * false/absent the attempt is released immediately and counts toward the grade.
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
    // Service-role client for the normalized tables: attempt_ai_evaluations is
    // teacher-only (RLS) and submitting students/public responders are not teachers.
    const serviceClient = createServiceRoleClient();

    const integrityBlock = await assertSubmissionNotIntegrityLocked(
      supabase,
      submissionId,
    );
    if (integrityBlock) {
      return integrityBlock;
    }

    // --- Fetch submission ---
    const { data: currentSubmission, error: fetchError } = await supabase
      .from("submissions")
      .select("submission_mode, assignment_id, feedback_released_at")
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

    const activityType = await getActivityTypeForAssignment(
      supabase,
      assignmentId,
    );

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

    // --- Resolve (or create) the normalized question row + next attempt number ---
    const { data: questionRow, error: questionError } = await serviceClient
      .from("submission_questions")
      .upsert(
        { submission_id: submissionId, question_order: questionOrder },
        { onConflict: "submission_id,question_order" },
      )
      .select("id")
      .single();

    if (questionError || !questionRow) {
      console.error("Error upserting submission_questions:", questionError);
      return NextResponse.json(
        { error: "Failed to prepare question" },
        { status: 500 },
      );
    }
    const questionId = questionRow.id as string;

    const { data: lastAttempt } = await serviceClient
      .from("submission_attempts")
      .select("attempt_number")
      .eq("submission_question_id", questionId)
      .order("attempt_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const attemptNumber = ((lastAttempt?.attempt_number as number) ?? 0) + 1;

    // --- Save transcript (and static_activity) keyed by attempt number ---
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

    // --- Synchronous evaluation (instant tentative-or-final feedback) ---
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
        activityType,
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

    // --- Persist the attempt (displayable grade) + AI audit row ---
    const { data: attemptRow, error: attemptError } = await serviceClient
      .from("submission_attempts")
      .insert({
        submission_question_id: questionId,
        attempt_number: attemptNumber,
        max_score: maxScore,
        stale: false,
        score: totalScore,
        feedback: overallFeedback,
        rubric_scores: validatedRubricScores,
      })
      .select("id, created_at")
      .single();

    if (attemptError || !attemptRow) {
      console.error("Error saving attempt:", attemptError);
      return NextResponse.json(
        { error: "Failed to save evaluation" },
        { status: 500 },
      );
    }
    const attemptId = attemptRow.id as string;

    const { error: aiError } = await serviceClient
      .from("attempt_ai_evaluations")
      .insert({
        attempt_id: attemptId,
        ai_score: totalScore,
        ai_feedback: overallFeedback,
        ai_rubric_scores: validatedRubricScores,
        model_meta: modelMetaFromResolved(evalModelConfig, evalKeySource),
      });
    if (aiError) {
      console.error("Error saving AI evaluation audit row:", aiError);
    }

    // --- Selection (default-last) + release branch ---
    const isReleased = !feedbackRequiresApproval;
    const questionUpdate: Record<string, unknown> = {
      selected_attempt_id: attemptId,
    };
    // Approval off → released immediately: count this attempt toward the total.
    if (isReleased) questionUpdate.released_score = totalScore;

    const { error: selError } = await serviceClient
      .from("submission_questions")
      .update(questionUpdate)
      .eq("id", questionId);
    if (selError) {
      console.error("Error updating selection/released_score:", selError);
    }

    if (isReleased && currentSubmission.feedback_released_at == null) {
      const now = new Date().toISOString();
      await serviceClient
        .from("submissions")
        .update({ feedback_released_at: now, updated_at: now })
        .eq("submission_id", submissionId)
        .is("feedback_released_at", null);
    }

    console.log("Returning success response with attempt:", {
      attemptNumber,
      score: totalScore,
      maxScore,
      released: isReleased,
    });

    return NextResponse.json({
      success: true,
      attempt: {
        id: attemptId,
        submission_question_id: questionId,
        attempt_number: attemptNumber,
        max_score: maxScore,
        stale: false,
        score: totalScore,
        feedback: overallFeedback,
        rubric_scores: validatedRubricScores,
        created_at: attemptRow.created_at,
        released: isReleased,
      },
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
      { status: 500 },
    );
  }
}
