import { createClient } from "@/lib/supabase";
import {
  Submission,
  SubmissionAttempt as NormalizedAttempt,
  RubricScore,
  SubmissionTranscript,
} from "@/types/submission";
import { validateFeedbackDoc, type FeedbackDoc } from "@/types/feedbackDoc";
import { nanoid } from "nanoid";
import { getAssignmentsByIdsForTeacher } from "./assignments";
import { getContentItemsByClass } from "./contentItems";
import { getClassStudentsWithInfo, StudentWithInfo } from "./students";

/** All columns for the submissions table (includes evaluations JSONB and activity metrics — use SUBMISSION_LIST_COLUMNS for list views) */
const SUBMISSION_ALL_COLUMNS =
  "id, submission_id, assignment_id, student_id, responder_details, preferred_language, submitted_at, status, submission_mode, created_at, updated_at, experience_rating, experience_rating_feedback, has_attempts, highest_score, max_score, total_attempts, questions_attempted_count, feedback_released_at, graded_score, tab_leave_events, input_violation_events, integrity_access_revoked_at, integrity_access_revoked_reason, generated_questions, generated_from_file_ids, questions_generated_at, is_preview";

/** Slim columns for session restore — excludes evaluations JSONB */
const SUBMISSION_SESSION_RESTORE_COLUMNS =
  "submission_id, assignment_id, student_id, responder_details, preferred_language, status, integrity_access_revoked_at, integrity_access_revoked_reason, generated_questions, generated_from_file_ids, is_preview";

/** All columns for the submission_transcripts table */
const TRANSCRIPT_ALL_COLUMNS =
  "id, submission_id, question_order, attempt_number, answer_text, created_at";

/**
 * Generate a unique short submission ID
 */
function generateSubmissionId(): string {
  return nanoid(8); // 8 characters: e.g., "x7k9m2pq"
}

/**
 * Students in `classDbId` with at least one formative assignment submission that
 * is held (has attempts but not yet released — awaiting teacher review/release).
 * Narrow read — `student_id` only.
 */
export async function getStudentIdsWithPendingApprovalsInClass(
  classDbId: string
): Promise<Set<string>> {
  const contentItems = await getContentItemsByClass(classDbId);
  const assignmentUuidRefs = contentItems
    .filter((ci) => ci.type === "formative_assignment")
    .map((ci) => ci.ref_id);
  if (assignmentUuidRefs.length === 0) return new Set();

  const assignments = await getAssignmentsByIdsForTeacher(assignmentUuidRefs);
  const submissionAssignmentPublicIds = assignments.map((a) => a.assignment_id);
  if (submissionAssignmentPublicIds.length === 0) return new Set();

  const supabase = createClient();
  const { data, error } = await supabase
    .from("submissions")
    .select("student_id")
    .eq("has_attempts", true)
    .is("feedback_released_at", null)
    .or("is_preview.is.null,is_preview.eq.false")
    .in("assignment_id", submissionAssignmentPublicIds);

  if (error) {
    console.error("Error fetching pending approvals by class:", error);
    throw error;
  }

  const out = new Set<string>();
  for (const row of data ?? []) {
    const sid = row.student_id as string | null | undefined;
    if (sid) out.add(sid);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Transcript queries (read from submission_transcripts table)
// ---------------------------------------------------------------------------

/**
 * Fetch transcript for a single attempt (used by TranscriptDialog)
 */
export async function getTranscript(
  submissionId: string,
  questionOrder: number,
  attemptNumber: number
): Promise<string | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("submission_transcripts")
    .select("answer_text")
    .eq("submission_id", submissionId)
    .eq("question_order", questionOrder)
    .eq("attempt_number", attemptNumber)
    .maybeSingle();

  if (error) {
    console.error("Error fetching transcript:", error);
    return null;
  }

  return data?.answer_text ?? null;
}

/**
 * Fetch transcript for the latest non-stale attempt of a question.
 * Used by session restore and VoiceAssessment to load previous answer text.
 */
export async function getLatestTranscript(
  submissionId: string,
  questionOrder: number
): Promise<string | null> {
  const supabase = createClient();

  // Resolve latest non-stale attempt from the normalized tables.
  const { attempts } = await getQuestionAttemptsNormalized(
    submissionId,
    questionOrder,
    true,
  );
  if (attempts.length === 0) return null;

  const latestAttemptNumber = attempts.reduce(
    (latest, current) =>
      current.attempt_number > latest ? current.attempt_number : latest,
    0,
  );
  if (!latestAttemptNumber) return null;

  const { data: transcriptData, error: transcriptError } = await supabase
    .from("submission_transcripts")
    .select("answer_text")
    .eq("submission_id", submissionId)
    .eq("question_order", questionOrder)
    .eq("attempt_number", latestAttemptNumber)
    .maybeSingle();

  if (transcriptError) {
    console.error("Error fetching latest transcript attempt:", transcriptError);
    return null;
  }

  return transcriptData?.answer_text ?? null;
}

/**
 * Fetch all transcripts for a submission (used by detail view if needed)
 */
export async function getTranscriptsForSubmission(
  submissionId: string
): Promise<SubmissionTranscript[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("submission_transcripts")
    .select(TRANSCRIPT_ALL_COLUMNS)
    .eq("submission_id", submissionId)
    .order("question_order", { ascending: true })
    .order("attempt_number", { ascending: true });

  if (error) {
    console.error("Error fetching transcripts:", error);
    return [];
  }

  return (data || []) as SubmissionTranscript[];
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Create a new submission record
 * Initializes with empty evaluations and in_progress status
 *
 * @param assignmentId - The assignment ID
 * @param preferredLanguage - Preferred language for the submission
 * @param submissionMode - The submission mode used (voice, text_chat, or static_text)
 * @param studentId - Optional: Student ID for authenticated submissions
 * @param responderDetails - Optional: Responder details for public submissions
 */
export async function createSubmission(
  assignmentId: string,
  preferredLanguage: string,
  submissionMode: "voice" | "text_chat" | "static_text" | "multimodal",
  options?: {
    studentId?: string;
    responderDetails?: Record<string, string>;
    /** Teacher "Save and Preview" run — marks the row preview (hidden everywhere). */
    isPreview?: boolean;
  }
): Promise<Submission> {
  const supabase = createClient();
  const submissionId = generateSubmissionId();

  // Build responder_details
  let responderDetails: Record<string, string> | undefined;

  if (options?.studentId) {
    // Authenticated student: get display name from user metadata
    const { data: userData } = await supabase.auth.getUser();
    const displayName =
      userData?.user?.user_metadata?.display_name ||
      userData?.user?.user_metadata?.name ||
      userData?.user?.email?.split("@")[0] ||
      "Student";
    responderDetails = { name: displayName };
  } else if (options?.responderDetails) {
    // Public submission: use provided responder details
    responderDetails = options.responderDetails;
  } else {
    throw new Error("Either studentId or responderDetails must be provided");
  }

  const insertData: Record<string, unknown> = {
    submission_id: submissionId,
    assignment_id: assignmentId,
    preferred_language: preferredLanguage,
    submission_mode: submissionMode,
    status: "in_progress",
    responder_details: responderDetails,
    // Denormalized defaults (rollups are otherwise trigger-maintained)
    has_attempts: false,
    highest_score: 0,
    max_score: 0,
    total_attempts: 0,
    questions_attempted_count: 0,
  };

  // Add student_id if provided
  if (options?.studentId) {
    insertData.student_id = options.studentId;
  }

  // Teacher preview run — filtered out of every submission read surface.
  if (options?.isPreview) {
    insertData.is_preview = true;
  }

  const { data, error } = await supabase
    .from("submissions")
    .insert(insertData)
    .select(SUBMISSION_SESSION_RESTORE_COLUMNS)
    .single();

  if (error) {
    console.error("Error creating submission:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  return data as unknown as Submission;
}

/**
 * Look up whether a student already has a submission for this assignment.
 * Returns only the submission_id (callers use getSubmissionForSessionRestore
 * or getSubmissionById when they need more columns).
 */
export async function getSubmissionByStudentAndAssignment(
  studentId: string,
  assignmentId: string
): Promise<{ submission_id: string } | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("submissions")
    .select("submission_id")
    .eq("student_id", studentId)
    .eq("assignment_id", assignmentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error fetching submission:", error);
    return null;
  }

  return data;
}

/**
 * Resume a teacher's existing preview submission for an assignment, if any.
 * Preview submissions carry the teacher's id in `student_id` and `is_preview=true`.
 * Returns the slim session-restore shape (same as createSubmission) so the preview
 * wrapper can reuse the row across repeat previews instead of piling up duplicates.
 */
export async function getPreviewSubmission(
  teacherId: string,
  assignmentId: string
): Promise<Submission | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("submissions")
    .select(SUBMISSION_SESSION_RESTORE_COLUMNS)
    .eq("student_id", teacherId)
    .eq("assignment_id", assignmentId)
    .eq("is_preview", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error fetching preview submission:", error);
    return null;
  }

  return (data as unknown as Submission) ?? null;
}

/**
 * Restart a preview run: stale every attempt and return the submission to
 * in_progress (reuses markAttemptsAsStale). The row stays `is_preview=true`, so it
 * remains hidden from all surfaces. Used by the preview wrapper's "Restart preview".
 */
export async function resetPreviewSubmission(
  submissionId: string
): Promise<void> {
  await markAttemptsAsStale(submissionId);
}

/**
 * Mark a submission as completed
 * Sets status to 'completed' and updates submitted_at timestamp
 */
export async function completeSubmission(
  submissionId: string
): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("submissions")
    .update({
      status: "completed",
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("submission_id", submissionId);

  if (error) {
    console.error("Error completing submission:", error);
    throw error;
  }
}

/**
 * Get a submission by its unique submission_id
 */
export async function getSubmissionById(
  submissionId: string
): Promise<Submission | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("submissions")
    .select(SUBMISSION_ALL_COLUMNS)
    .eq("submission_id", submissionId)
    .maybeSingle();

  if (error) {
    if (error.code !== "PGRST116") {
      console.error("Error fetching submission:", error);
    }
    return null;
  }

  return data;
}

/**
 * Lightweight session-restore fetch — excludes evaluations JSONB.
 * Use for student/public session restore; prefer getSubmissionById when
 * the full evaluations blob is genuinely needed (e.g. teacher detail view).
 */
export async function getSubmissionForSessionRestore(
  submissionId: string
): Promise<{
  submission_id: string;
  assignment_id: string;
  student_id?: string | null;
  responder_details?: Record<string, string>;
  preferred_language: string;
  status: "in_progress" | "completed";
  integrity_access_revoked_at?: string | null;
  integrity_access_revoked_reason?: string | null;
  generated_questions?: import("@/types/assignment").Question[] | null;
  generated_from_file_ids?: string[] | null;
} | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("submissions")
    .select(SUBMISSION_SESSION_RESTORE_COLUMNS)
    .eq("submission_id", submissionId)
    .maybeSingle();

  if (error) {
    if (error.code !== "PGRST116") {
      console.error("Error fetching submission for session restore:", error);
    }
    return null;
  }

  return data;
}

// ---------------------------------------------------------------------------
// Attempt queries
// ---------------------------------------------------------------------------

/**
 * Return the set of question orders that have at least one non-stale attempt.
 * Single DB round-trip — replaces per-question getQuestionAttempts loops.
 */
export async function getQuestionsWithAttempts(
  submissionId: string
): Promise<Set<number>> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("submission_questions")
    .select(
      "question_order, submission_attempts!submission_attempts_submission_question_id_fkey(stale)"
    )
    .eq("submission_id", submissionId);

  if (error || !data) return new Set();

  const result = new Set<number>();
  for (const q of data as {
    question_order: number;
    submission_attempts: { stale: boolean }[] | null;
  }[]) {
    if ((q.submission_attempts ?? []).some((a) => !a.stale)) {
      result.add(q.question_order);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Normalized attempt reads (submission_questions -> submission_attempts)
// ---------------------------------------------------------------------------

/** Raw shape of a submission_attempts row (DB column names). */
interface RawAttemptRow {
  id: string;
  submission_question_id: string;
  attempt_number: number;
  max_score: number | string;
  stale: boolean;
  score: number | string | null;
  feedback: string | null;
  feedback_doc: unknown;
  rubric_scores: RubricScore[] | null;
  created_at: string;
}

function mapAttemptRow(row: RawAttemptRow, released: boolean): NormalizedAttempt {
  return {
    id: row.id,
    submission_question_id: row.submission_question_id,
    attempt_number: row.attempt_number,
    max_score: Number(row.max_score ?? 0),
    stale: row.stale,
    score: row.score == null ? null : Number(row.score),
    feedback: row.feedback,
    feedback_doc: validateFeedbackDoc(row.feedback_doc),
    rubric_scores: row.rubric_scores ?? null,
    created_at: row.created_at,
    released,
  };
}

export interface NormalizedQuestionAttempts {
  attempts: NormalizedAttempt[];
  /** FK of the attempt whose score counts (default = last non-stale). */
  selectedAttemptId: string | null;
  /** Derived from submission.feedback_released_at (whole-submission release flag). */
  released: boolean;
  /**
   * The attempt_number the next attempt will be recorded under = max over ALL
   * attempts (stale included) + 1. Mirrors the evaluate route's numbering so an
   * in-progress conversation writes its chat_messages/voice_messages under the
   * same number evaluate will assign. Always >= 1.
   */
  nextAttemptNumber: number;
}

/**
 * Read a single question's attempts from the normalized tables (browser client).
 * Each attempt carries a derived `released` flag (= submission.feedback_released_at
 * is set). Tentative attempts (released === false on an approval-required assignment)
 * still carry the AI grade — the UI shows them under a tentative banner.
 */
export async function getQuestionAttemptsNormalized(
  submissionId: string,
  questionOrder: number,
  excludeStale: boolean = false
): Promise<NormalizedQuestionAttempts> {
  const supabase = createClient();

  const { data: sub } = await supabase
    .from("submissions")
    .select("feedback_released_at, assignment_id")
    .eq("submission_id", submissionId)
    .maybeSingle();

  // Assignment-level gate (batch mode): a finalized submission is only visible to
  // the student once the teacher opens the assignment gate (grades_released_at).
  let gateOpen = true;
  if (sub?.assignment_id) {
    const { data: asg } = await supabase
      .from("assignments")
      .select("batch_grade_release, grades_released_at")
      .eq("assignment_id", sub.assignment_id)
      .maybeSingle();
    if (asg?.batch_grade_release) {
      gateOpen = asg.grades_released_at != null;
    }
  }
  const released = sub?.feedback_released_at != null && gateOpen;

  const { data: question, error } = await supabase
    .from("submission_questions")
    .select(
      "id, selected_attempt_id, submission_attempts!submission_attempts_submission_question_id_fkey(id, submission_question_id, attempt_number, max_score, stale, score, feedback, feedback_doc, rubric_scores, created_at)"
    )
    .eq("submission_id", submissionId)
    .eq("question_order", questionOrder)
    .maybeSingle();

  if (error) {
    if (error.code === "PGRST116") {
      return { attempts: [], selectedAttemptId: null, released, nextAttemptNumber: 1 };
    }
    console.error("Error fetching normalized question attempts:", error);
    throw error;
  }
  if (!question)
    return { attempts: [], selectedAttemptId: null, released, nextAttemptNumber: 1 };

  let rows = ((question.submission_attempts ?? []) as RawAttemptRow[]).slice();
  // Next attempt number = max over ALL attempts (stale included) + 1, computed
  // before the excludeStale filter so it matches the evaluate route's numbering.
  const nextAttemptNumber =
    rows.reduce((max, r) => Math.max(max, r.attempt_number), 0) + 1;
  if (excludeStale) rows = rows.filter((r) => !r.stale);
  rows.sort((a, b) => a.attempt_number - b.attempt_number);

  return {
    attempts: rows.map((r) => mapAttemptRow(r, released)),
    selectedAttemptId: (question.selected_attempt_id as string | null) ?? null,
    released,
    nextAttemptNumber,
  };
}

// ---------------------------------------------------------------------------
// Teacher grading read (normalized; includes AI audit + review state)
// ---------------------------------------------------------------------------

export interface TeacherGradingAttempt {
  id: string;
  attempt_number: number;
  max_score: number;
  stale: boolean;
  score: number | null;
  feedback: string | null;
  feedback_doc: FeedbackDoc | null;
  rubric_scores: RubricScore[] | null;
  /** Original AI output (audit), for an optional "compare to AI" affordance. */
  ai_score: number | null;
  ai_feedback: string | null;
  ai_feedback_doc: FeedbackDoc | null;
  ai_rubric_scores: RubricScore[] | null;
  /** Unpublished teacher draft for this attempt (null when no pending draft). */
  hasDraft: boolean;
  draft_score: number | null;
  draft_feedback: string | null;
  draft_feedback_doc: FeedbackDoc | null;
  draft_rubric_scores: RubricScore[] | null;
}

export interface TeacherGradingQuestion {
  id: string;
  question_order: number;
  selected_attempt_id: string | null;
  released_score: number | null;
  reviewed: boolean;
  /** Who/when the review row was stamped (null when AI-generated, never reviewed). */
  reviewed_at: string | null;
  reviewed_by: string | null;
  attempts: TeacherGradingAttempt[];
}

export interface SubmissionGrading {
  /** Whole-submission finalized state (submissions.feedback_released_at is set). */
  released: boolean;
  /** Timestamp the submission was finalized (feedback_released_at), or null. */
  releasedAt: string | null;
  /** Any attempt has an unpublished teacher draft. */
  hasUnpublishedDraft: boolean;
  questions: TeacherGradingQuestion[];
}

interface RawTeacherAttemptRow {
  id: string;
  attempt_number: number;
  max_score: number | string;
  stale: boolean;
  score: number | string | null;
  feedback: string | null;
  feedback_doc: unknown;
  rubric_scores: RubricScore[] | null;
  attempt_ai_evaluations:
    | { ai_score: number | string | null; ai_feedback: string | null; ai_feedback_doc: unknown; ai_rubric_scores: RubricScore[] | null }
    | { ai_score: number | string | null; ai_feedback: string | null; ai_feedback_doc: unknown; ai_rubric_scores: RubricScore[] | null }[]
    | null;
  attempt_grade_drafts:
    | { draft_score: number | string | null; draft_feedback: string | null; draft_feedback_doc: unknown; draft_rubric_scores: RubricScore[] | null }
    | { draft_score: number | string | null; draft_feedback: string | null; draft_feedback_doc: unknown; draft_rubric_scores: RubricScore[] | null }[]
    | null;
}

interface RawTeacherQuestionRow {
  id: string;
  question_order: number;
  selected_attempt_id: string | null;
  released_score: number | string | null;
  submission_attempts: RawTeacherAttemptRow[] | null;
  submission_question_reviews:
    | { id: string; reviewed_at: string | null; reviewed_by: string | null }
    | { id: string; reviewed_at: string | null; reviewed_by: string | null }[]
    | null;
}

function firstOrSelf<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

/**
 * Read the full normalized grading state for a submission (teacher view): every
 * question with its attempts, each attempt's displayable grade + original AI
 * output, plus the selected attempt, per-question released score and review flag,
 * and the whole-submission release state. Uses the teacher's session (RLS grants
 * read access to the teacher-only AI/review tables).
 */
export async function getSubmissionGrading(
  submissionId: string
): Promise<SubmissionGrading> {
  const supabase = createClient();

  const { data: sub } = await supabase
    .from("submissions")
    .select("feedback_released_at")
    .eq("submission_id", submissionId)
    .maybeSingle();
  const releasedAt = (sub?.feedback_released_at as string | null) ?? null;
  const released = releasedAt != null;

  const { data, error } = await supabase
    .from("submission_questions")
    .select(
      "id, question_order, selected_attempt_id, released_score, " +
        "submission_attempts!submission_attempts_submission_question_id_fkey(" +
        "id, attempt_number, max_score, stale, score, feedback, feedback_doc, rubric_scores, " +
        "attempt_ai_evaluations(ai_score, ai_feedback, ai_feedback_doc, ai_rubric_scores), " +
        "attempt_grade_drafts(draft_score, draft_feedback, draft_feedback_doc, draft_rubric_scores)), " +
        "submission_question_reviews(id, reviewed_at, reviewed_by)"
    )
    .eq("submission_id", submissionId)
    .order("question_order", { ascending: true });

  if (error) {
    console.error("Error fetching submission grading:", error);
    throw error;
  }

  const questions: TeacherGradingQuestion[] = (
    (data ?? []) as unknown as RawTeacherQuestionRow[]
  ).map((q) => {
    const attempts = (q.submission_attempts ?? [])
      .slice()
      .sort((a, b) => a.attempt_number - b.attempt_number)
      .map((a) => {
        const ai = firstOrSelf(a.attempt_ai_evaluations);
        const draft = firstOrSelf(a.attempt_grade_drafts);
        return {
          id: a.id,
          attempt_number: a.attempt_number,
          max_score: Number(a.max_score ?? 0),
          stale: a.stale,
          score: a.score == null ? null : Number(a.score),
          feedback: a.feedback,
          feedback_doc: validateFeedbackDoc(a.feedback_doc),
          rubric_scores: a.rubric_scores ?? null,
          ai_score: ai?.ai_score == null ? null : Number(ai.ai_score),
          ai_feedback: ai?.ai_feedback ?? null,
          ai_feedback_doc: validateFeedbackDoc(ai?.ai_feedback_doc),
          ai_rubric_scores: ai?.ai_rubric_scores ?? null,
          hasDraft: draft != null,
          draft_score: draft?.draft_score == null ? null : Number(draft.draft_score),
          draft_feedback: draft?.draft_feedback ?? null,
          draft_feedback_doc: validateFeedbackDoc(draft?.draft_feedback_doc),
          draft_rubric_scores: draft?.draft_rubric_scores ?? null,
        };
      });
    const review = firstOrSelf(q.submission_question_reviews);
    return {
      id: q.id,
      question_order: q.question_order,
      selected_attempt_id: q.selected_attempt_id,
      released_score: q.released_score == null ? null : Number(q.released_score),
      reviewed: review != null,
      reviewed_at: review?.reviewed_at ?? null,
      reviewed_by: review?.reviewed_by ?? null,
      attempts,
    };
  });

  const hasUnpublishedDraft = questions.some((q) =>
    q.attempts.some((a) => a.hasDraft),
  );

  return { released, releasedAt, hasUnpublishedDraft, questions };
}


// ---------------------------------------------------------------------------
// Stale / reset
// ---------------------------------------------------------------------------

/**
 * Reset a submission so the student can start fresh: mark every attempt stale,
 * clear selection / released_score / review rows / the release flag, and return
 * the submission to in_progress. History is preserved (attempts are kept, stale).
 *
 * Rollups (graded_score, max_score, total_attempts, …) are recomputed by the DB
 * trigger as attempts/questions change; we only set the submission-level flags.
 * Teacher-initiated (RLS allows the teacher to clear the teacher-only review rows).
 */
export async function markAttemptsAsStale(
  submissionId: string
): Promise<void> {
  const supabase = createClient();

  const { data: questions, error: qErr } = await supabase
    .from("submission_questions")
    .select("id")
    .eq("submission_id", submissionId);
  if (qErr) {
    console.error("Error fetching questions for reset:", qErr);
    throw qErr;
  }

  const questionIds = (questions ?? []).map((q) => q.id as string);

  if (questionIds.length > 0) {
    const { error: staleErr } = await supabase
      .from("submission_attempts")
      .update({ stale: true })
      .in("submission_question_id", questionIds);
    if (staleErr) {
      console.error("Error marking attempts stale:", staleErr);
      throw staleErr;
    }

    const { error: reviewErr } = await supabase
      .from("submission_question_reviews")
      .delete()
      .in("submission_question_id", questionIds);
    if (reviewErr) {
      console.error("Error clearing reviews on reset:", reviewErr);
      throw reviewErr;
    }

    const { error: clearErr } = await supabase
      .from("submission_questions")
      .update({ selected_attempt_id: null, released_score: null })
      .eq("submission_id", submissionId);
    if (clearErr) {
      console.error("Error clearing question selection/released_score:", clearErr);
      throw clearErr;
    }
  }

  const { error } = await supabase
    .from("submissions")
    .update({
      feedback_released_at: null,
      status: "in_progress",
      submitted_at: null,
      // Legacy denormalized column still read by some list views until fully migrated.
      highest_score: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("submission_id", submissionId);

  if (error) {
    console.error("Error resetting submission:", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Teacher list-view queries (use denormalized columns, exclude JSONB)
// ---------------------------------------------------------------------------

/** Columns to select for list views (excludes evaluations JSONB) */
const SUBMISSION_LIST_COLUMNS =
  "id, submission_id, assignment_id, student_id, responder_details, preferred_language, submission_mode, status, submitted_at, created_at, updated_at, experience_rating, experience_rating_feedback, has_attempts, highest_score, max_score, total_attempts, questions_attempted_count, feedback_released_at, graded_score, integrity_access_revoked_at, integrity_access_revoked_reason, is_preview";

/**
 * Student submission status for teacher view
 */
export interface StudentSubmissionStatus {
  student: StudentWithInfo;
  submission: Submission | null;
  status: "completed" | "started" | "not_started";
  hasAttempts: boolean;
  highestScore?: number;
  maxScore?: number;
  totalAttempts: number;
  /** Number of questions with at least one attempt (from denormalized column) */
  questionsAttemptedCount: number;
  /** Whole-submission release state (feedback_released_at is set). */
  released: boolean;
  /** Counted total (Σ released_score). 0/“pending review” while unreleased. */
  gradedScore?: number;
}

/**
 * Public submission status for teacher view
 */
export interface PublicSubmissionStatus {
  submission: Submission;
  status: "completed" | "started";
  hasAttempts: boolean;
  highestScore?: number;
  maxScore?: number;
  totalAttempts: number;
  /** Number of questions with at least one attempt (from denormalized column) */
  questionsAttemptedCount: number;
  /** Whole-submission release state (feedback_released_at is set). */
  released: boolean;
  /** Counted total (Σ released_score). 0/“pending review” while unreleased. */
  gradedScore?: number;
}

/**
 * Get all students in a class with their submission status for an assignment.
 * Uses denormalized columns -- does NOT fetch the evaluations JSONB.
 * When classGroupId is provided, only students in that group are returned.
 */
export async function getSubmissionsByAssignmentWithStudents(
  assignmentId: string,
  classId: string,
  classGroupId?: string | null
): Promise<StudentSubmissionStatus[]> {
  const supabase = createClient();

  const [allStudents, { data: allSubmissions, error: submissionsError }] =
    await Promise.all([
      getClassStudentsWithInfo(classId),
      supabase
        .from("submissions")
        .select(SUBMISSION_LIST_COLUMNS)
        .eq("assignment_id", assignmentId)
        .not("student_id", "is", null)
        .or("is_preview.is.null,is_preview.eq.false")
        .order("created_at", { ascending: false }),
    ]);

  if (submissionsError) {
    console.error("Error fetching submissions:", submissionsError);
  }

  // When assignment is group-scoped, show only students in that group
  const students =
    classGroupId != null
      ? allStudents.filter((s) => s.group_id === classGroupId)
      : allStudents;

  // Build a map: student_id -> most recent submission
  const submissionMap = new Map<string, Submission>();
  for (const sub of (allSubmissions || []) as Submission[]) {
    if (sub.student_id && !submissionMap.has(sub.student_id)) {
      submissionMap.set(sub.student_id, sub);
    }
  }

  const result: StudentSubmissionStatus[] = students.map((student) => {
    const submission = submissionMap.get(student.student_id) || null;

    let status: "completed" | "started" | "not_started";
    let highestScore: number | undefined;
    let maxScore: number | undefined;
    let totalAttempts = 0;
    let hasAttempts = false;
    let questionsAttemptedCount = 0;

    let released = false;
    let gradedScore: number | undefined;

    if (!submission) {
      status = "not_started";
    } else {
      // Read directly from denormalized columns
      hasAttempts = submission.has_attempts;
      totalAttempts = submission.total_attempts;
      highestScore = submission.highest_score;
      maxScore = submission.max_score;
      questionsAttemptedCount = submission.questions_attempted_count ?? 0;
      released = submission.feedback_released_at != null;
      gradedScore = submission.graded_score ?? 0;

      // Completed only when submission is explicitly marked complete; otherwise in progress
      status =
        submission.status === "completed" ? "completed" : "started";
    }

    return {
      student,
      submission,
      status,
      hasAttempts,
      highestScore,
      maxScore,
      totalAttempts,
      questionsAttemptedCount,
      released,
      gradedScore,
    };
  });

  return result;
}

/**
 * Get all public submissions for a specific assignment.
 * Uses denormalized columns -- does NOT fetch the evaluations JSONB.
 */
export async function getPublicSubmissionsByAssignment(
  assignmentId: string
): Promise<PublicSubmissionStatus[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("submissions")
    .select(SUBMISSION_LIST_COLUMNS)
    .eq("assignment_id", assignmentId)
    .is("student_id", null)
    .or("is_preview.is.null,is_preview.eq.false")
    .order("submitted_at", { ascending: false });

  if (error) {
    console.error("Error fetching public submissions:", error);
    throw error;
  }

  const submissions = (data || []) as Submission[];

  const result: PublicSubmissionStatus[] = submissions.map((submission) => {
    // Read directly from denormalized columns
    const hasAttempts = submission.has_attempts;
    const totalAttempts = submission.total_attempts;
    const highestScore = submission.highest_score;
    const maxScore = submission.max_score;
    const questionsAttemptedCount =
      submission.questions_attempted_count ?? 0;
    const released = submission.feedback_released_at != null;
    const gradedScore = submission.graded_score ?? 0;
    // Completed only when submission is explicitly marked complete
    const status: "completed" | "started" =
      submission.status === "completed" ? "completed" : "started";

    return {
      submission,
      status,
      hasAttempts,
      highestScore,
      maxScore,
      totalAttempts,
      questionsAttemptedCount,
      released,
      gradedScore,
    };
  });

  return result;
}

/**
 * Save experience rating for a submission
 * Called when student rates their assessment experience on completion
 */
export async function saveExperienceRating(
  submissionId: string,
  rating: number,
  feedback?: string
): Promise<void> {
  const supabase = createClient();

  const updateData: Record<string, unknown> = {
    experience_rating: rating,
    updated_at: new Date().toISOString(),
  };

  if (feedback && feedback.trim()) {
    updateData.experience_rating_feedback = feedback.trim();
  }

  const { error } = await supabase
    .from("submissions")
    .update(updateData)
    .eq("submission_id", submissionId);

  if (error) {
    console.error("Error saving experience rating:", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Lightweight activity metrics (tab leaves, input violations)
// ---------------------------------------------------------------------------

/**
 * Append a single tab-leave timestamp to the submission's tab_leave_events array.
 * The array is stored as a JSON column on the submissions table.
 */
/**
 * Appends a tab-leave timestamp. Returns the new event count, or null on failure.
 */
export async function appendTabLeaveEvent(
  submissionId: string,
  timestamp: string
): Promise<number | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("submissions")
    .select("tab_leave_events")
    .eq("submission_id", submissionId)
    .single();

  if (error) {
    console.error("Error fetching tab_leave_events:", error);
    return null;
  }

  const existing =
    (data?.tab_leave_events as string[] | null | undefined) ?? [];

  const next = [...existing, timestamp];

  const { error: updateError } = await supabase
    .from("submissions")
    .update({
      tab_leave_events: next,
      updated_at: new Date().toISOString(),
    })
    .eq("submission_id", submissionId);

  if (updateError) {
    console.error("Error appending tab_leave_event:", updateError);
    return null;
  }

  return next.length;
}

export interface SetSubmissionIntegrityRevokedParams {
  reason: string;
}

/**
 * Locks the submission for integrity violations (student cannot continue until teacher clears).
 */
export async function setSubmissionIntegrityRevoked(
  submissionId: string,
  params: SetSubmissionIntegrityRevokedParams
): Promise<void> {
  const supabase = createClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("submissions")
    .update({
      integrity_access_revoked_at: now,
      integrity_access_revoked_reason: params.reason,
      updated_at: now,
    })
    .eq("submission_id", submissionId);

  if (error) {
    console.error("Error setting submission integrity revoked:", error);
    throw error;
  }
}

/**
 * Clears integrity lock (teacher action).
 * Also resets `tab_leave_events` so tab-switch counting starts fresh and the
 * student is not immediately locked again on the next leave.
 */
export async function clearSubmissionIntegrityRevocation(
  submissionId: string
): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("submissions")
    .update({
      integrity_access_revoked_at: null,
      integrity_access_revoked_reason: null,
      tab_leave_events: [],
      updated_at: new Date().toISOString(),
    })
    .eq("submission_id", submissionId);

  if (error) {
    console.error("Error clearing submission integrity revocation:", error);
    throw error;
  }
}

export interface InputViolationEventPayload {
  timestamp: string;
  text: string;
}

/**
 * Append a single input violation event (timestamp + attempted text) to
 * the submission's input_violation_events array.
 */
export async function appendInputViolationEvent(
  submissionId: string,
  event: InputViolationEventPayload
): Promise<void> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("submissions")
    .select("input_violation_events")
    .eq("submission_id", submissionId)
    .single();

  if (error) {
    console.error("Error fetching input_violation_events:", error);
    return;
  }

  const existing =
    (data?.input_violation_events as InputViolationEventPayload[] | null | undefined) ??
    [];

  const { error: updateError } = await supabase
    .from("submissions")
    .update({
      input_violation_events: [...existing, event],
      updated_at: new Date().toISOString(),
    })
    .eq("submission_id", submissionId);

  if (updateError) {
    console.error("Error appending input_violation_event:", updateError);
  }
}

