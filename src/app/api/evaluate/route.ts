import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase-server";
import { assertSubmissionNotIntegrityLocked } from "@/lib/integrity/assertSubmissionNotIntegrityLocked";
import {
  catalogNotConfiguredResponse,
} from "@/lib/ai/credentials/resolveCatalogConfig";
import { resolveMeteredModel, type AiCallContext } from "@/lib/ai/gateway";
import { evaluateSubmission } from "@/lib/ai/evaluateSubmission";
import { classifyAiError } from "@/lib/ai/errors";
import { logAppEvent } from "@/lib/logging/appLog";
import {
  buildFeedbackFocusPromptText,
  parseFeedbackFocusAreas,
} from "@/lib/feedbackFocus";
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

  // Captured inside the try for use by the terminal-failure log in the catch
  // (classDbId/activityType are resolved mid-request, past the destructure).
  let logClassId: string | null = null;
  let logActivityId: string | null = null;
  let logSubmissionId: string | null = null;
  let logQuestionOrder: number | null = null;

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

    logClassId = classDbId;
    logActivityId = assignmentId;
    logSubmissionId = submissionId;
    logQuestionOrder = questionOrder;

    // Teacher "Feedback focus" areas steer the AI's feedback sections.
    const { data: assignmentConfig } = await supabase
      .from("assignments")
      .select("feedback_focus")
      .eq("assignment_id", assignmentId)
      .maybeSingle();
    const feedbackFocus =
      buildFeedbackFocusPromptText(
        parseFeedbackFocusAreas(assignmentConfig?.feedback_focus),
      ) || undefined;

    // attemptNumber isn't known until the query below; the handle keeps a
    // reference to this same context object, so filling it in later still
    // reaches the invocation row written at completion time.
    const evalContext: AiCallContext = {
      classDbId,
      assignmentId,
      submissionId,
      questionOrder,
    };
    let evalHandle;
    try {
      evalHandle = await resolveMeteredModel({
        appFunctionKey: "text.evaluation",
        context: evalContext,
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
    evalContext.attemptNumber = attemptNumber;

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

    const { validatedRubricScores, overallFeedback, feedbackDoc, totalScore } =
      await evaluateSubmission({
        handle: evalHandle,
        questionPrompt,
        answerText,
        rubric,
        language,
        sharedContext,
        customEvaluationPrompt,
        feedbackFocus,
        activityType,
        onRetryAttempt: (attempt, error) => {
          logAppEvent({
            level: "warn",
            source: "evaluate",
            event: "silent_retry",
            errorCode: classifyAiError(error).code,
            message: error instanceof Error ? error.message : undefined,
            classId: classDbId,
            activityId: assignmentId,
            submissionId,
            questionOrder,
            metadata: { attempt },
          });
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
        feedback_doc: feedbackDoc,
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
        ai_feedback_doc: feedbackDoc,
        ai_rubric_scores: validatedRubricScores,
        model_meta: evalHandle.meta,
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
        feedback_doc: feedbackDoc,
        rubric_scores: validatedRubricScores,
        created_at: attemptRow.created_at,
        released: isReleased,
      },
    });
  } catch (error) {
    console.error("=== Evaluation error ===");
    console.error("Error:", error);
    console.error("Stack:", error instanceof Error ? error.stack : "N/A");

    // Classify + pass through honest HTTP statuses (429/503) so the client can
    // decide retry treatment from `code`/`retryable` rather than a blanket 500.
    const classified = classifyAiError(error);

    logAppEvent({
      level: "error",
      source: "evaluate",
      event: "ai_failure",
      errorCode: classified.code,
      message: classified.message,
      classId: logClassId,
      activityId: logActivityId,
      submissionId: logSubmissionId,
      questionOrder: logQuestionOrder,
    });
    const status =
      classified.code === "RATE_LIMITED"
        ? 429
        : classified.code === "PROVIDER_UNAVAILABLE"
          ? 503
          : classified.code === "AI_NOT_CONFIGURED"
            ? 503
            : classified.code === "BAD_REQUEST"
              ? 400
              : 500;

    return NextResponse.json(
      {
        error: "Failed to evaluate answer",
        details: error instanceof Error ? error.message : "Unknown error",
        code: classified.code,
        retryable: classified.retryable,
        ...(classified.retryAfterMs
          ? { retryAfterMs: classified.retryAfterMs }
          : {}),
      },
      { status },
    );
  }
}
