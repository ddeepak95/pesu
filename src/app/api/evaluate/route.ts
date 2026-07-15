import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase-server";
import { assertSubmissionNotIntegrityLocked } from "@/lib/integrity/assertSubmissionNotIntegrityLocked";
import {
  catalogNotConfiguredResponse,
} from "@/lib/ai/credentials/resolveCatalogConfig";
import { quotaExceededResponse } from "@/lib/ai/metering/quota";
import {
  resolveMeteredModel,
  runWithAiContext,
  type AiCallContext,
} from "@/lib/ai/gateway";
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
import { ensureAttemptSession } from "@/lib/submissions/attemptSessions";
import {
  getOrCreateCurrentAttempt,
  upsertSubmissionQuestion,
} from "@/lib/submissions/attempts";

interface EvaluateRequestBody {
  submissionId: string;
  questionOrder: number;
  questionId: string;
  sessionId?: string | null;
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
      questionId,
      sessionId,
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
      !questionId ||
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

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id ?? null;

    return await runWithAiContext({ userId, classId: classDbId }, async () => {
    // --- Resolve (or create) the normalized question row + current attempt ---
    // Reuses the in-progress row from a multimodal conversation (attempt-start)
    // if one exists; creates fresh for static_text/voice (which never call
    // attempt-start) exactly like the old INSERT-only flow did.
    const submissionQuestionId = await upsertSubmissionQuestion(serviceClient, {
      submissionId,
      questionOrder,
      questionId,
    });
    const { id: attemptId, attempt_number: attemptNumber } =
      await getOrCreateCurrentAttempt(serviceClient, {
        submissionQuestionId,
        maxScore,
      });

    // attempt id/number are known up front now (unlike before), so the
    // evaluation call's ai_invocations row gets them without any post-hoc
    // linking.
    const evalContext: AiCallContext = {
      classDbId,
      assignmentId,
      submissionId,
      questionOrder,
      questionId,
      sessionId,
      attemptId,
      attemptNumber,
      // Grading already-completed work must never be blocked (decision #2) —
      // rides through the quota check unconditionally; still debits and may
      // drive the wallet negative.
      quotaPolicy: "ride-through",
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
      const quotaBlocked = quotaExceededResponse(error);
      if (quotaBlocked) {
        return NextResponse.json(quotaBlocked.body, { status: quotaBlocked.status });
      }
      throw error;
    }

    if (sessionId) {
      await ensureAttemptSession(serviceClient, {
        id: sessionId,
        submissionId,
        questionId,
        attemptNumber,
        attemptId,
      });
    }

    // --- Save transcript (and static_activity) keyed by attempt number ---
    const { error: transcriptError } = await supabase
      .from("submission_transcripts")
      .upsert(
        {
          submission_id: submissionId,
          question_order: questionOrder,
          question_id: questionId,
          attempt_number: attemptNumber,
          answer_text: answerText,
          session_id: sessionId ?? null,
          attempt_id: attemptId,
        },
        { onConflict: "submission_id,question_id,attempt_number" },
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
            question_id: questionId,
            attempt_number: attemptNumber,
            content: answerText,
            session_id: sessionId ?? null,
            attempt_id: attemptId,
          },
          { onConflict: "submission_id,question_id,attempt_number" },
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
    // The row already exists (created earlier by attempt-start or the
    // getOrCreateCurrentAttempt fallback above) — grading UPDATEs it rather
    // than inserting a new one. max_score is re-stamped from the rubric sum
    // (the authoritative denominator) rather than trusting whatever seed value
    // the row was created with, so every graded attempt (multimodal and
    // static/voice alike) carries the identical denominator the rollup relies on.
    const { data: attemptRow, error: attemptError } = await serviceClient
      .from("submission_attempts")
      .update({
        max_score: maxScore,
        score: totalScore,
        feedback: overallFeedback,
        feedback_doc: feedbackDoc,
        rubric_scores: validatedRubricScores,
        graded_at: new Date().toISOString(),
        session_id: sessionId ?? null,
      })
      .eq("id", attemptId)
      .select("id, created_at")
      .single();

    if (attemptError || !attemptRow) {
      console.error("Error saving attempt:", attemptError);
      return NextResponse.json(
        { error: "Failed to save evaluation" },
        { status: 500 },
      );
    }
    const lastInvocationId = evalHandle.lastInvocationId;

    const { error: aiError } = await serviceClient
      .from("attempt_ai_evaluations")
      .insert({
        attempt_id: attemptId,
        ai_score: totalScore,
        ai_feedback: overallFeedback,
        ai_feedback_doc: feedbackDoc,
        ai_rubric_scores: validatedRubricScores,
        model_meta: evalHandle.meta,
        ai_invocation_id: lastInvocationId ?? null,
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
      .eq("id", submissionQuestionId);
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
        submission_question_id: submissionQuestionId,
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
