/**
 * Server-side grading helpers for the normalized schema: submission-level release
 * (publish), teacher grade drafts (save/discard), per-question review marking, and
 * selected-attempt updates.
 *
 * Visibility model: the student reads submission_attempts.{score,feedback,rubric_scores}
 * directly. Teacher edits are held in attempt_grade_drafts (teacher-only) and never
 * touch those columns until release/publish — so a draft never leaks to the student.
 *
 * These operate on a Supabase client passed by the caller (API routes pass the
 * server client). See dev-docs/teacher-approval-grading-flow.md (§5/§6 Phase 3+5).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RubricScore } from "@/types/submission";
import type { FeedbackDoc } from "@/types/feedbackDoc";

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
  question_id: string;
  submission_attempts: { stale: boolean }[] | null;
  // UNIQUE fk -> PostgREST returns a to-one object (or null), not an array.
  submission_question_reviews: { id: string } | { id: string }[] | null;
}

/**
 * Pure review-gate check: returns the ids of questions that have at least one
 * non-stale attempt but no review row. An empty array means the gate is satisfied.
 */
export function unreviewedQuestionIds(rows: QuestionGateRow[]): string[] {
  const out: string[] = [];
  for (const q of rows) {
    const hasNonStale = (q.submission_attempts ?? []).some((a) => !a.stale);
    const rev = q.submission_question_reviews;
    const reviewed = Array.isArray(rev) ? rev.length > 0 : rev != null;
    if (hasNonStale && !reviewed) out.push(q.question_id);
  }
  return out;
}

// ---------------------------------------------------------------------------
// DB-backed helpers
// ---------------------------------------------------------------------------

/** Resolve a submission_questions.id from (submission_id, question_id). */
async function getQuestionId(
  supabase: SupabaseClient,
  submissionId: string,
  questionId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("submission_questions")
    .select("id")
    .eq("submission_id", submissionId)
    .eq("question_id", questionId)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Every submission_attempts.id belonging to a submission (across its questions). */
async function getAttemptIdsForSubmission(
  supabase: SupabaseClient,
  questionIds: string[]
): Promise<string[]> {
  if (questionIds.length === 0) return [];
  const { data, error } = await supabase
    .from("submission_attempts")
    .select("id")
    .in("submission_question_id", questionIds);
  if (error) throw error;
  return (data ?? []).map((a) => a.id as string);
}

/** Fetch the review-gate state for every question in a submission. */
export async function getUnreviewedQuestionIds(
  supabase: SupabaseClient,
  submissionId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("submission_questions")
    .select(
      "question_id, submission_attempts!submission_attempts_submission_question_id_fkey(stale), submission_question_reviews(id)"
    )
    .eq("submission_id", submissionId);
  if (error) throw error;
  return unreviewedQuestionIds((data ?? []) as QuestionGateRow[]);
}

export interface AttemptEdit {
  attemptId: string;
  score?: number | null;
  feedback?: string | null;
  /** Structured feedback document (flattened into `feedback` for the fallback). */
  feedback_doc?: FeedbackDoc | null;
  rubric_scores?: RubricScore[] | null;
}

export interface SelectionOverride {
  questionId: string;
  selectedAttemptId: string;
}

export interface ReleaseOptions {
  edits?: AttemptEdit[];
  selections?: SelectionOverride[];
}

export type ReleaseResult =
  | { ok: true }
  | { ok: false; unreviewedQuestionIds: string[] };

/**
 * Recompute each question's released_score from its selected attempt's (published)
 * score. Called after publishing so the teacher totals / graded_score reflect the
 * student-visible values.
 */
async function syncReleasedScores(
  supabase: SupabaseClient,
  questions: { id: string; selected_attempt_id: string | null }[]
): Promise<void> {
  for (const q of questions) {
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
}

/**
 * Release (first release) or publish (re-release) a submission:
 *  1. apply selection overrides (so the gate + released_score see the final selection);
 *  2. enforce the review gate — only on the FIRST release (when feedback_released_at is
 *     null). Re-publishing an already-released grade is not gated;
 *  3. publish: copy incoming `edits` and any saved drafts into the student-visible
 *     submission_attempts columns, then delete the draft rows;
 *  4. sync each question's released_score from its selected attempt;
 *  5. stamp submissions.feedback_released_at (first release only).
 */
export async function releaseSubmission(
  supabase: SupabaseClient,
  submissionId: string,
  opts: ReleaseOptions = {}
): Promise<ReleaseResult> {
  // 1. Selection overrides first.
  for (const sel of opts.selections ?? []) {
    const { error } = await supabase
      .from("submission_questions")
      .update({ selected_attempt_id: sel.selectedAttemptId })
      .eq("submission_id", submissionId)
      .eq("question_id", sel.questionId);
    if (error) throw error;
  }

  // 2. Review gate — first release only.
  const { data: subRow } = await supabase
    .from("submissions")
    .select("feedback_released_at")
    .eq("submission_id", submissionId)
    .maybeSingle();
  const alreadyReleased = subRow?.feedback_released_at != null;
  if (!alreadyReleased) {
    const unreviewed = await getUnreviewedQuestionIds(supabase, submissionId);
    if (unreviewed.length > 0) {
      return { ok: false, unreviewedQuestionIds: unreviewed };
    }
  }

  // 3. Publish. Gather this submission's questions + attempts.
  const { data: questionRows, error: qErr } = await supabase
    .from("submission_questions")
    .select("id, selected_attempt_id")
    .eq("submission_id", submissionId);
  if (qErr) throw qErr;
  const questions = (questionRows ?? []) as {
    id: string;
    selected_attempt_id: string | null;
  }[];
  const attemptIds = await getAttemptIdsForSubmission(
    supabase,
    questions.map((q) => q.id)
  );

  // Build the publish map: incoming edits win, then fall back to saved drafts.
  const publishMap = new Map<string, AttemptEdit>();
  for (const edit of opts.edits ?? []) {
    publishMap.set(edit.attemptId, edit);
  }
  if (attemptIds.length > 0) {
    const { data: drafts, error: dErr } = await supabase
      .from("attempt_grade_drafts")
      .select(
        "attempt_id, draft_score, draft_feedback, draft_feedback_doc, draft_rubric_scores",
      )
      .in("attempt_id", attemptIds);
    if (dErr) throw dErr;
    for (const d of drafts ?? []) {
      if (publishMap.has(d.attempt_id)) continue;
      publishMap.set(d.attempt_id, {
        attemptId: d.attempt_id,
        score: d.draft_score,
        feedback: d.draft_feedback,
        feedback_doc: d.draft_feedback_doc,
        rubric_scores: d.draft_rubric_scores,
      });
    }
  }

  for (const edit of publishMap.values()) {
    const patch: Record<string, unknown> = {};
    if (edit.score !== undefined) patch.score = edit.score;
    if (edit.feedback !== undefined) patch.feedback = edit.feedback;
    if (edit.feedback_doc !== undefined) patch.feedback_doc = edit.feedback_doc;
    if (edit.rubric_scores !== undefined) patch.rubric_scores = edit.rubric_scores;
    if (Object.keys(patch).length === 0) continue;
    const { error } = await supabase
      .from("submission_attempts")
      .update(patch)
      .eq("id", edit.attemptId);
    if (error) throw error;
  }

  // Drafts are now published; clear them.
  if (attemptIds.length > 0) {
    const { error: delErr } = await supabase
      .from("attempt_grade_drafts")
      .delete()
      .in("attempt_id", attemptIds);
    if (delErr) throw delErr;
  }

  // 4. released_score = selected attempt's (published) score, per question.
  await syncReleasedScores(supabase, questions);

  // 5. Flip the whole submission to released (first release only).
  if (!alreadyReleased) {
    const { error: relErr } = await supabase
      .from("submissions")
      .update({ feedback_released_at: new Date().toISOString() })
      .eq("submission_id", submissionId);
    if (relErr) throw relErr;
  }

  return { ok: true };
}

/**
 * Persist per-attempt grade edits as a teacher-only DRAFT, without changing what
 * the student sees. Upserts into attempt_grade_drafts (one row per attempt). The
 * student-visible submission_attempts columns are untouched until release/publish.
 */
export async function saveAttemptEdits(
  supabase: SupabaseClient,
  edits: AttemptEdit[],
  updatedBy: string | null = null
): Promise<void> {
  if (edits.length === 0) return;
  const rows = edits.map((e) => ({
    attempt_id: e.attemptId,
    draft_score: e.score ?? null,
    draft_feedback: e.feedback ?? null,
    draft_feedback_doc: e.feedback_doc ?? null,
    draft_rubric_scores: e.rubric_scores ?? null,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  }));
  const { error } = await supabase
    .from("attempt_grade_drafts")
    .upsert(rows, { onConflict: "attempt_id" });
  if (error) throw error;
}

/**
 * Discard all unpublished drafts for a submission, reverting the teacher's working
 * state back to the published values. Does not change release state.
 */
export async function discardDrafts(
  supabase: SupabaseClient,
  submissionId: string
): Promise<void> {
  const { data: questions, error: qErr } = await supabase
    .from("submission_questions")
    .select("id")
    .eq("submission_id", submissionId);
  if (qErr) throw qErr;
  const attemptIds = await getAttemptIdsForSubmission(
    supabase,
    (questions ?? []).map((q) => q.id as string)
  );
  if (attemptIds.length === 0) return;
  const { error } = await supabase
    .from("attempt_grade_drafts")
    .delete()
    .in("attempt_id", attemptIds);
  if (error) throw error;
}

/**
 * Mark a question reviewed (upsert) or un-reviewed (delete the review row).
 */
export async function setQuestionReviewed(
  supabase: SupabaseClient,
  submissionId: string,
  questionId: string,
  reviewed: boolean,
  reviewedBy: string | null
): Promise<void> {
  const submissionQuestionId = await getQuestionId(supabase, submissionId, questionId);
  if (!submissionQuestionId) throw new Error(`question not found: ${submissionId}/${questionId}`);

  if (reviewed) {
    const { error } = await supabase
      .from("submission_question_reviews")
      .upsert(
        {
          submission_question_id: submissionQuestionId,
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
      .eq("submission_question_id", submissionQuestionId);
    if (error) throw error;
  }
}

/**
 * Set a question's selected attempt by attempt_number. When `clearReview` is true
 * (teacher changed the counted attempt) the question's review row is removed so it
 * must be re-reviewed before release.
 *
 * Selection has no student-facing effect (the student always sees the latest
 * attempt) and does not publish anything: released_score is recomputed only at
 * release/publish, so switching the counted attempt does not leak to the student.
 */
export async function setSelectedAttempt(
  supabase: SupabaseClient,
  submissionId: string,
  questionId: string,
  attemptNumber: number,
  opts: { clearReview?: boolean } = {}
): Promise<void> {
  const submissionQuestionId = await getQuestionId(supabase, submissionId, questionId);
  if (!submissionQuestionId) throw new Error(`question not found: ${submissionId}/${questionId}`);

  const { data: attempt, error: aErr } = await supabase
    .from("submission_attempts")
    .select("id")
    .eq("submission_question_id", submissionQuestionId)
    .eq("attempt_number", attemptNumber)
    .maybeSingle();
  if (aErr) throw aErr;
  if (!attempt) {
    throw new Error(`attempt not found: ${submissionId}/${questionId}/${attemptNumber}`);
  }

  const { error } = await supabase
    .from("submission_questions")
    .update({ selected_attempt_id: attempt.id })
    .eq("id", submissionQuestionId);
  if (error) throw error;

  if (opts.clearReview) {
    const { error: rErr } = await supabase
      .from("submission_question_reviews")
      .delete()
      .eq("submission_question_id", submissionQuestionId);
    if (rErr) throw rErr;
  }
}
