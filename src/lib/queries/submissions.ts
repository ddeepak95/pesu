import { createClient } from "@/lib/supabase";
import {
  Submission,
  SubmissionAnswer,
  SubmissionAttempt,
  QuestionEvaluations,
  SubmissionTranscript,
} from "@/types/submission";
import { nanoid } from "nanoid";
import { getClassStudentsWithInfo, StudentWithInfo } from "./students";

/** All columns for the submissions table (includes evaluations JSONB and activity metrics — use SUBMISSION_LIST_COLUMNS for list views) */
const SUBMISSION_ALL_COLUMNS =
  "id, submission_id, assignment_id, student_id, responder_details, preferred_language, evaluations, submitted_at, status, submission_mode, created_at, updated_at, experience_rating, experience_rating_feedback, has_attempts, highest_score, max_score, total_attempts, questions_attempted_count, has_pending_approvals, tab_leave_events, input_violation_events";

/** Slim columns for session restore — excludes evaluations JSONB */
const SUBMISSION_SESSION_RESTORE_COLUMNS =
  "submission_id, assignment_id, student_id, responder_details, preferred_language, status";

/** All columns for the submission_transcripts table */
const TRANSCRIPT_ALL_COLUMNS =
  "id, submission_id, question_order, attempt_number, answer_text, created_at";

/**
 * Generate a unique short submission ID
 */
function generateSubmissionId(): string {
  return nanoid(8); // 8 characters: e.g., "x7k9m2pq"
}

// ---------------------------------------------------------------------------
// Denormalized-field helpers
// ---------------------------------------------------------------------------

/**
 * Compute denormalized summary fields from the evaluations JSONB.
 * Called on every write path that modifies attempts.
 */
export function computeDenormalizedFields(evaluations: {
  [key: number]: QuestionEvaluations;
}): {
  has_attempts: boolean;
  highest_score: number;
  max_score: number;
  total_attempts: number;
  questions_attempted_count: number;
  has_pending_approvals: boolean;
} {
  let hasAttempts = false;
  let highestScore = 0;
  let maxScore = 0;
  let totalAttempts = 0;
  let questionsAttemptedCount = 0;
  let hasPendingApprovals = false;

  for (const qa of Object.values(evaluations)) {
    const nonStale = (qa.attempts || []).filter((a) => !a.stale);
    if (nonStale.length > 0) {
      hasAttempts = true;
      questionsAttemptedCount += 1;
      totalAttempts += nonStale.length;
      highestScore += Math.max(...nonStale.map((a) => a.score));
      maxScore += nonStale[0].max_score;
    }
    if (nonStale.some((a) => a.feedback_approved === false && !a.is_evaluating)) {
      hasPendingApprovals = true;
    }
  }

  return {
    has_attempts: hasAttempts,
    highest_score: highestScore,
    max_score: maxScore,
    total_attempts: totalAttempts,
    questions_attempted_count: questionsAttemptedCount,
    has_pending_approvals: hasPendingApprovals,
  };
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

  // Get the latest transcript by attempt_number descending
  const { data, error } = await supabase
    .from("submission_transcripts")
    .select("answer_text")
    .eq("submission_id", submissionId)
    .eq("question_order", questionOrder)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error fetching latest transcript:", error);
    return null;
  }

  return data?.answer_text ?? null;
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
  submissionMode: "voice" | "text_chat" | "static_text",
  options?: {
    studentId?: string;
    responderDetails?: Record<string, string>;
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
    evaluations: {},
    status: "in_progress",
    responder_details: responderDetails,
    // Denormalized defaults
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

  const { data, error } = await supabase
    .from("submissions")
    .insert(insertData)
    .select(SUBMISSION_SESSION_RESTORE_COLUMNS)
    .single();

  if (error) {
    console.error("Error creating submission:", error);
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
// Format helpers
// ---------------------------------------------------------------------------

/**
 * Helper: Check if evaluations use new attempt-based format
 */
function isNewFormat(
  evaluations:
    | { [key: number]: QuestionEvaluations }
    | SubmissionAnswer[]
): evaluations is { [key: number]: QuestionEvaluations } {
  return !Array.isArray(evaluations);
}

/**
 * Helper: Convert old format to new format
 */
function convertToNewFormat(
  oldAnswers: SubmissionAnswer[]
): { [key: number]: QuestionEvaluations } {
  const newEvals: { [key: number]: QuestionEvaluations } = {};
  oldAnswers.forEach((answer) => {
    newEvals[answer.question_order] = {
      attempts: [
        {
          attempt_number: 1,
          score: 0,
          max_score: 0,
          rubric_scores: [],
          evaluation_feedback: "",
          timestamp: new Date().toISOString(),
          stale: false,
        },
      ],
      selected_attempt: 1,
    };
  });
  return newEvals;
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
    .from("submissions")
    .select("evaluations")
    .eq("submission_id", submissionId)
    .single();

  if (error || !data?.evaluations) return new Set();

  let evaluations = data.evaluations as
    | { [key: number]: QuestionEvaluations }
    | SubmissionAnswer[];

  if (!isNewFormat(evaluations)) {
    evaluations = convertToNewFormat(evaluations);
  }

  const result = new Set<number>();
  for (const [key, qa] of Object.entries(evaluations)) {
    if ((qa as QuestionEvaluations).attempts?.some((a) => !a.stale)) {
      result.add(Number(key));
    }
  }
  return result;
}

/**
 * Get all attempts for a specific question
 * @param excludeStale - If true, filters out stale attempts (default: false)
 */
function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError && err.message === "Failed to fetch") return true;
  if (err && typeof err === "object" && "message" in err)
    return (err as { message?: string }).message === "Failed to fetch";
  return false;
}

export async function getQuestionAttempts(
  submissionId: string,
  questionOrder: number,
  excludeStale: boolean = false
): Promise<SubmissionAttempt[]> {
  const supabase = createClient();

  let data: { evaluations?: unknown } | null = null;
  let error: { code?: string; message?: string; details?: unknown } | null = null;

  try {
    const result = await supabase
      .from("submissions")
      .select("evaluations")
      .eq("submission_id", submissionId)
      .single();
    data = result.data;
    error = result.error;
  } catch (thrown) {
    if (isNetworkError(thrown)) {
      console.warn(
        "Could not fetch submission (network/connectivity). Returning no attempts.",
        thrown instanceof Error ? thrown.message : String(thrown)
      );
      return [];
    }
    throw thrown;
  }

  if (error) {
    if (error.code === "PGRST116") {
      return [];
    }
    if (isNetworkError(error)) {
      console.warn(
        "Could not fetch submission (network/connectivity). Returning no attempts.",
        error.message
      );
      return [];
    }
    console.error(
      "Error fetching submission:",
      error.message,
      error.code,
      error.details
    );
    throw error;
  }

  let evaluations = data?.evaluations as
    | { [key: number]: QuestionEvaluations }
    | SubmissionAnswer[]
    | undefined;

  if (evaluations == null) return [];

  if (!isNewFormat(evaluations)) {
    evaluations = convertToNewFormat(evaluations);
  }

  const attempts = evaluations[questionOrder]?.attempts || [];

  if (excludeStale) {
    return attempts.filter((attempt) => !attempt.stale);
  }

  return attempts;
}


// ---------------------------------------------------------------------------
// Stale / reset
// ---------------------------------------------------------------------------

/**
 * Mark all attempts in a submission as stale
 * This allows students to start fresh while preserving history
 */
export async function markAttemptsAsStale(
  submissionId: string
): Promise<void> {
  const supabase = createClient();

  const { data: currentSubmission, error: fetchError } = await supabase
    .from("submissions")
    .select("evaluations")
    .eq("submission_id", submissionId)
    .single();

  if (fetchError) {
    console.error("Error fetching submission:", fetchError);
    throw fetchError;
  }

  let evaluations = currentSubmission.evaluations as
    | { [key: number]: QuestionEvaluations }
    | SubmissionAnswer[];

  if (!isNewFormat(evaluations)) {
    evaluations = convertToNewFormat(evaluations);
  }

  Object.values(evaluations).forEach((questionEvals) => {
    const qa = questionEvals as QuestionEvaluations;
    if (qa.attempts) {
      qa.attempts.forEach((attempt) => {
        attempt.stale = true;
      });
    }
  });

  const { error } = await supabase
    .from("submissions")
    .update({
      evaluations: evaluations,
      has_attempts: false,
      highest_score: 0,
      max_score: 0,
      total_attempts: 0,
      questions_attempted_count: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("submission_id", submissionId);

  if (error) {
    console.error("Error marking attempts as stale:", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Teacher list-view queries (use denormalized columns, exclude JSONB)
// ---------------------------------------------------------------------------

/** Columns to select for list views (excludes evaluations JSONB) */
const SUBMISSION_LIST_COLUMNS =
  "id, submission_id, assignment_id, student_id, responder_details, preferred_language, submission_mode, status, submitted_at, created_at, updated_at, experience_rating, experience_rating_feedback, has_attempts, highest_score, max_score, total_attempts, questions_attempted_count, has_pending_approvals";

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
  /** True when at least one attempt is awaiting teacher feedback approval */
  hasPendingApprovals: boolean;
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
  /** True when at least one attempt is awaiting teacher feedback approval */
  hasPendingApprovals: boolean;
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

    let hasPendingApprovals = false;

    if (!submission) {
      status = "not_started";
    } else {
      // Read directly from denormalized columns
      hasAttempts = submission.has_attempts;
      totalAttempts = submission.total_attempts;
      highestScore = submission.highest_score;
      maxScore = submission.max_score;
      questionsAttemptedCount = submission.questions_attempted_count ?? 0;
      hasPendingApprovals = submission.has_pending_approvals ?? false;

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
      hasPendingApprovals,
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
    const hasPendingApprovals = submission.has_pending_approvals ?? false;
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
      hasPendingApprovals,
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
export async function appendTabLeaveEvent(
  submissionId: string,
  timestamp: string
): Promise<void> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("submissions")
    .select("tab_leave_events")
    .eq("submission_id", submissionId)
    .single();

  if (error) {
    console.error("Error fetching tab_leave_events:", error);
    return;
  }

  const existing =
    (data?.tab_leave_events as string[] | null | undefined) ?? [];

  const { error: updateError } = await supabase
    .from("submissions")
    .update({
      tab_leave_events: [...existing, timestamp],
      updated_at: new Date().toISOString(),
    })
    .eq("submission_id", submissionId);

  if (updateError) {
    console.error("Error appending tab_leave_event:", updateError);
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

