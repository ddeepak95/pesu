/**
 * Server-side grading helpers for the normalized schema: submission-level release,
 * reopen, per-question review marking, and selected-attempt updates.
 *
 * These operate on a Supabase client passed by the caller (API routes pass the
 * server client). See dev-docs/teacher-approval-grading-flow.md (§5/§6 Phase 3+5).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RubricScore } from "@/types/submission";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export interface AttemptLite {
  id: string;
  attempt_number: number;
  stale: boolean;
}

/**
 * Default selection rule: the student's most recent (last) non-stale attempt.
 * Returns null when there are no non-stale attempts.
 */
export function pickLastAttemptId(attempts: AttemptLite[]): string | null {
  const nonStale = attempts.filter((a) => !a.stale);
  if (nonStale.length === 0) return null;
  return nonStale.reduce((m, a) => (a.attempt_number > m.attempt_number ? a : m)).id;
}

interface QuestionGateRow {
  question_order: number;
  submission_attempts: { stale: boolean }[] | null;
  // UNIQUE fk -> PostgREST returns a to-one object (or null), not an array.
  submission_question_reviews: { id: string } | { id: string }[] | null;
}

/**
 * Pure review-gate check: returns the orders of questions that have at least one
 * non-stale attempt but no review row. An empty array means the gate is satisfied.
 */
export function unreviewedQuestionOrders(rows: QuestionGateRow[]): number[] {
  const out: number[] = [];
  for (const q of rows) {
    const hasNonStale = (q.submission_attempts ?? []).some((a) => !a.stale);
    const rev = q.submission_question_reviews;
    const reviewed = Array.isArray(rev) ? rev.length > 0 : rev != null;
    if (hasNonStale && !reviewed) out.push(q.question_order);
  }
  return out.sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// DB-backed helpers
// ---------------------------------------------------------------------------

/** Resolve a submission_questions.id from (submission_id, question_order). */
async function getQuestionId(
  supabase: SupabaseClient,
  submissionId: string,
  questionOrder: number
): Promise<string | null> {
  const { data } = await supabase
    .from("submission_questions")
    .select("id")
    .eq("submission_id", submissionId)
    .eq("question_order", questionOrder)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Fetch the review-gate state for every question in a submission. */
export async function getUnreviewedQuestionOrders(
  supabase: SupabaseClient,
  submissionId: string
): Promise<number[]> {
  const { data, error } = await supabase
    .from("submission_questions")
    .select(
      "question_order, submission_attempts!submission_attempts_submission_question_id_fkey(stale), submission_question_reviews(id)"
    )
    .eq("submission_id", submissionId);
  if (error) throw error;
  return unreviewedQuestionOrders((data ?? []) as QuestionGateRow[]);
}

export interface AttemptEdit {
  attemptId: string;
  score?: number | null;
  feedback?: string | null;
  rubric_scores?: RubricScore[] | null;
}

export interface SelectionOverride {
  questionOrder: number;
  selectedAttemptId: string;
}

export interface ReleaseOptions {
  edits?: AttemptEdit[];
  selections?: SelectionOverride[];
}

export type ReleaseResult =
  | { ok: true }
  | { ok: false; unreviewedQuestionOrders: number[] };

/**
 * Release a submission: apply selection overrides, enforce the review gate, apply
 * per-attempt edits, set each question's released_score from its selected attempt,
 * and stamp submissions.feedback_released_at. One atomic-ish action (no save-draft).
 */
export async function releaseSubmission(
  supabase: SupabaseClient,
  submissionId: string,
  opts: ReleaseOptions = {}
): Promise<ReleaseResult> {
  // 1. Selection overrides first (so the gate + released_score see final selection).
  for (const sel of opts.selections ?? []) {
    const { error } = await supabase
      .from("submission_questions")
      .update({ selected_attempt_id: sel.selectedAttemptId })
      .eq("submission_id", submissionId)
      .eq("question_order", sel.questionOrder);
    if (error) throw error;
  }

  // 2. Review gate.
  const unreviewed = await getUnreviewedQuestionOrders(supabase, submissionId);
  if (unreviewed.length > 0) {
    return { ok: false, unreviewedQuestionOrders: unreviewed };
  }

  // 3. Apply per-attempt edits to the displayable grade columns.
  for (const edit of opts.edits ?? []) {
    const patch: Record<string, unknown> = {};
    if (edit.score !== undefined) patch.score = edit.score;
    if (edit.feedback !== undefined) patch.feedback = edit.feedback;
    if (edit.rubric_scores !== undefined) patch.rubric_scores = edit.rubric_scores;
    if (Object.keys(patch).length === 0) continue;
    const { error } = await supabase
      .from("submission_attempts")
      .update(patch)
      .eq("id", edit.attemptId);
    if (error) throw error;
  }

  // 4. released_score = selected attempt's (possibly edited) score, per question.
  const { data: questions, error: qErr } = await supabase
    .from("submission_questions")
    .select("id, selected_attempt_id")
    .eq("submission_id", submissionId);
  if (qErr) throw qErr;

  for (const q of questions ?? []) {
    let releasedScore: number | null = null;
    if (q.selected_attempt_id) {
      const { data: att } = await supabase
        .from("submission_attempts")
        .select("score")
        .eq("id", q.selected_attempt_id)
        .maybeSingle();
      releasedScore = att?.score == null ? null : Number(att.score);
    }
    const { error } = await supabase
      .from("submission_questions")
      .update({ released_score: releasedScore })
      .eq("id", q.id);
    if (error) throw error;
  }

  // 5. Flip the whole submission to released.
  const { error: relErr } = await supabase
    .from("submissions")
    .update({ feedback_released_at: new Date().toISOString() })
    .eq("submission_id", submissionId);
  if (relErr) throw relErr;

  return { ok: true };
}

/**
 * Reopen a released submission: clear the release flag and every question's
 * released_score so it reverts to tentative for amendment + re-release.
 */
export async function reopenSubmission(
  supabase: SupabaseClient,
  submissionId: string
): Promise<void> {
  const { error: qErr } = await supabase
    .from("submission_questions")
    .update({ released_score: null })
    .eq("submission_id", submissionId);
  if (qErr) throw qErr;

  const { error } = await supabase
    .from("submissions")
    .update({ feedback_released_at: null })
    .eq("submission_id", submissionId);
  if (error) throw error;
}

/**
 * Mark a question reviewed (upsert) or un-reviewed (delete the review row).
 */
export async function setQuestionReviewed(
  supabase: SupabaseClient,
  submissionId: string,
  questionOrder: number,
  reviewed: boolean,
  reviewedBy: string | null
): Promise<void> {
  const questionId = await getQuestionId(supabase, submissionId, questionOrder);
  if (!questionId) throw new Error(`question not found: ${submissionId}/${questionOrder}`);

  if (reviewed) {
    const { error } = await supabase
      .from("submission_question_reviews")
      .upsert(
        {
          submission_question_id: questionId,
          reviewed_at: new Date().toISOString(),
          reviewed_by: reviewedBy,
        },
        { onConflict: "submission_question_id" }
      );
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("submission_question_reviews")
      .delete()
      .eq("submission_question_id", questionId);
    if (error) throw error;
  }
}

/**
 * Set a question's selected attempt by attempt_number. When `clearReview` is true
 * (teacher changed the counted attempt) the question's review row is removed so it
 * must be re-reviewed before release.
 */
export async function setSelectedAttempt(
  supabase: SupabaseClient,
  submissionId: string,
  questionOrder: number,
  attemptNumber: number,
  opts: { clearReview?: boolean } = {}
): Promise<void> {
  const questionId = await getQuestionId(supabase, submissionId, questionOrder);
  if (!questionId) throw new Error(`question not found: ${submissionId}/${questionOrder}`);

  const { data: attempt, error: aErr } = await supabase
    .from("submission_attempts")
    .select("id")
    .eq("submission_question_id", questionId)
    .eq("attempt_number", attemptNumber)
    .maybeSingle();
  if (aErr) throw aErr;
  if (!attempt) {
    throw new Error(`attempt not found: ${submissionId}/${questionOrder}/${attemptNumber}`);
  }

  const { error } = await supabase
    .from("submission_questions")
    .update({ selected_attempt_id: attempt.id })
    .eq("id", questionId);
  if (error) throw error;

  if (opts.clearReview) {
    const { error: rErr } = await supabase
      .from("submission_question_reviews")
      .delete()
      .eq("submission_question_id", questionId);
    if (rErr) throw rErr;
  }
}
