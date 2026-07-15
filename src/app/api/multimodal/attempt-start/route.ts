import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getClassDbIdForAssignment } from "@/lib/assignments/assignmentClassCache";
import {
  getOrCreateCurrentAttempt,
  upsertSubmissionQuestion,
} from "@/lib/submissions/attempts";
import { ensureAttemptSession } from "@/lib/submissions/attemptSessions";
import { assertSessionCanStart, QuotaExceededError, quotaExceededResponse } from "@/lib/ai/metering/quota";

interface AttemptStartRequestBody {
  sessionId: string;
  submissionId: string;
  questionOrder: number;
  questionId: string;
  maxScore: number;
}

/**
 * The single place a multimodal attempt (and its first attempt_sessions row)
 * is created. Client-blocking: the conversation does not start until this
 * resolves, since every downstream write (chat_messages, ai_invocations, ...)
 * FKs to the attempt_id this returns. See dev-docs/attempt-identity-plan.md
 * Phase C.
 *
 * Also the single per-session quota admission point (dev-docs/ai-usage-
 * metering-phase3-plan.md D6) — assertSessionCanStart resolves every AI
 * surface the session will use and refuses to start it (no attempt/session
 * row written) if any is block-enforced and exhausted.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AttemptStartRequestBody;
    const { sessionId, submissionId, questionOrder, questionId, maxScore } = body;

    if (
      !sessionId ||
      !submissionId ||
      questionOrder === undefined ||
      !questionId ||
      maxScore == null
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();

    const { data: submissionRow, error: submissionError } = await supabase
      .from("submissions")
      .select("assignment_id")
      .eq("submission_id", submissionId)
      .single();
    if (submissionError || !submissionRow?.assignment_id) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 },
      );
    }
    const assignmentId = submissionRow.assignment_id as string;

    const classDbId = await getClassDbIdForAssignment(supabase, assignmentId);
    if (!classDbId) {
      return NextResponse.json(
        { error: "Assignment not found" },
        { status: 404 },
      );
    }

    try {
      await assertSessionCanStart({ classDbId, assignmentId });
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        const quotaBlocked = quotaExceededResponse(error);
        if (quotaBlocked) {
          return NextResponse.json(quotaBlocked.body, { status: quotaBlocked.status });
        }
      }
      throw error;
    }

    const submissionQuestionId = await upsertSubmissionQuestion(supabase, {
      submissionId,
      questionOrder,
      questionId,
    });
    const attempt = await getOrCreateCurrentAttempt(supabase, {
      submissionQuestionId,
      maxScore,
    });
    await ensureAttemptSession(supabase, {
      id: sessionId,
      submissionId,
      questionId,
      attemptNumber: attempt.attempt_number,
      attemptId: attempt.id,
    });

    return NextResponse.json({
      attemptId: attempt.id,
      attemptNumber: attempt.attempt_number,
    });
  } catch (error) {
    console.error("[multimodal/attempt-start]", error);
    return NextResponse.json(
      {
        error: "Failed to start attempt",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
