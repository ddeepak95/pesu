import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ensureAttemptSession } from "@/lib/submissions/attemptSessions";

interface AttemptSessionRequestBody {
  sessionId: string;
  submissionId: string;
  questionId?: string | null;
  attemptNumber: number;
}

/**
 * Stamp `attempt_sessions.started_at` at true page-load time. Not load-bearing
 * for correctness — every child-writing route (turn, utterance, evaluate) also
 * calls `ensureAttemptSession` before its own FK-bearing insert, so a slow or
 * failed request here never blocks a chat/transcript write. See
 * dev-docs/question-stable-ids-plan.md § attempt_session_id.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AttemptSessionRequestBody;
    const { sessionId, submissionId, questionId, attemptNumber } = body;

    if (!sessionId || !submissionId || attemptNumber == null) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();
    await ensureAttemptSession(supabase, {
      id: sessionId,
      submissionId,
      questionId: questionId ?? null,
      attemptNumber,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[multimodal/attempt-session]", error);
    return NextResponse.json(
      {
        error: "Failed to create attempt session",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
