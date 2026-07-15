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
 * Backward-compat alias for an already-open old client page during deploy
 * skew (which fire-and-forgets here instead of awaiting /attempt-start).
 * Kept only for this release — delete in the follow-up cleanup pass once no
 * old client bundle can still be in flight. See
 * dev-docs/attempt-identity-plan.md Phase C.
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
