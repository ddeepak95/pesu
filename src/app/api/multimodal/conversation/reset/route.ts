import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

interface ResetConversationBody {
  submissionId?: string;
  questionOrder?: number;
  attemptNumber?: number;
}

/**
 * Discard any leftover in-progress conversation for a single attempt before the
 * student (re)starts it. Multimodal has no session-resume: when a student
 * refreshes mid-conversation and starts again, the prior chat_messages /
 * voice_messages / session audio must be cleared so old + new turns don't mix
 * and audio utterance ordinals don't collide.
 *
 * Safe to delete by (submission, question, attempt): the client targets
 * attemptNumber = max(all attempts incl. stale) + 1, which is always greater
 * than every already-evaluated attempt's number, so this can only remove
 * un-evaluated refresh garbage — never a recorded attempt's conversation.
 */
export async function POST(request: NextRequest) {
  try {
    const { submissionId, questionOrder, attemptNumber } =
      (await request.json()) as ResetConversationBody;

    if (
      !submissionId ||
      questionOrder == null ||
      attemptNumber == null
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();
    const match = {
      submission_id: submissionId,
      question_order: questionOrder,
      attempt_number: attemptNumber,
    };

    const [chat, voice, session] = await Promise.all([
      supabase.from("chat_messages").delete().match(match),
      supabase.from("voice_messages").delete().match(match),
      supabase.from("submission_session_audio").delete().match(match),
    ]);

    const error = chat.error ?? voice.error ?? session.error;
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[multimodal/conversation/reset]", error);
    return NextResponse.json(
      {
        error: "Failed to reset conversation",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
