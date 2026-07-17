import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Upsert the normalized submission_questions row for (submissionId, questionId)
 * and return its id. Extracted from evaluate/route.ts's original inline upsert
 * so /api/multimodal/attempt-start can share it.
 */
export async function upsertSubmissionQuestion(
  client: SupabaseClient,
  input: { submissionId: string; questionOrder: number; questionId: string },
): Promise<string> {
  // Retried once: the table has a second unique index, (submission_id,
  // question_order), that is NOT the upsert's conflict target. When two
  // identical calls race (React Strict Mode double-effect, double-click),
  // the loser's insert can raise 23505 on that index instead of taking the
  // DO UPDATE path — ON CONFLICT only arbitrates on its own target. By the
  // retry, the winner's row is committed and the upsert resolves normally.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await client
      .from("submission_questions")
      .upsert(
        {
          submission_id: input.submissionId,
          question_order: input.questionOrder,
          question_id: input.questionId,
        },
        { onConflict: "submission_id,question_id" },
      )
      .select("id")
      .single();

    if (data && !error) {
      return data.id as string;
    }
    lastError = error;
    if (error?.code !== "23505") break;
  }
  throw lastError ?? new Error("Failed to upsert submission_questions");
}

export interface CurrentAttempt {
  id: string;
  submission_question_id: string;
  attempt_number: number;
  max_score: number;
  stale: boolean;
  score: number | null;
  graded_at: string | null;
  created_at: string;
}

/**
 * Reuse the in-progress (ungraded, non-stale) attempt for a question if one
 * exists, else create a fresh one. Thin wrapper over the
 * get_or_create_current_attempt RPC (SELECT ... FOR UPDATE + IF NOT FOUND,
 * see the migration for the race-safety rationale).
 */
export async function getOrCreateCurrentAttempt(
  client: SupabaseClient,
  input: { submissionQuestionId: string; maxScore: number },
): Promise<CurrentAttempt> {
  // Not a SETOF-returning function — RETURNS submission_attempts (singular)
  // means PostgREST already returns one composite object, not an array, so
  // no .single() here (unlike the SETOF-implicit .from() queries above).
  const { data, error } = await client.rpc("get_or_create_current_attempt", {
    p_submission_question_id: input.submissionQuestionId,
    p_max_score: input.maxScore,
  });

  if (error || !data) {
    throw error ?? new Error("Failed to get or create current attempt");
  }
  return data as CurrentAttempt;
}
