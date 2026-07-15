import type { SupabaseClient } from "@supabase/supabase-js";

export interface EnsureAttemptSessionInput {
  id: string;
  submissionId: string;
  questionId?: string | null;
  attemptNumber: number;
  /**
   * Optional, not required — `attempt-start` (the primary caller in steady
   * state) always passes a resolved id, but `turn`/`utterance` keep calling
   * this defensively during the deploy-skew window and may not have one.
   */
  attemptId?: string | null;
}

/**
 * Idempotently create the parent `attempt_sessions` row before a child write
 * (chat_messages/voice_messages/submission_transcripts/static_activity) that
 * FKs to it. `on conflict (id) do nothing` makes this safe to call from every
 * writer that shares a session id — first writer wins, the rest no-op. Call
 * (and await) this immediately before the FK-bearing insert in the same
 * request so the race against Postgres's FK check is structurally impossible.
 */
export async function ensureAttemptSession(
  client: SupabaseClient,
  input: EnsureAttemptSessionInput,
): Promise<void> {
  const { error } = await client.from("attempt_sessions").upsert(
    {
      id: input.id,
      submission_id: input.submissionId,
      question_id: input.questionId ?? null,
      attempt_number: input.attemptNumber,
      attempt_id: input.attemptId ?? null,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );

  if (error) {
    console.error("[ensureAttemptSession] failed to upsert:", error);
  }
}
