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
} {
  let hasAttempts = false;
  let highestScore = 0;
  let maxScore = 0;
  let totalAttempts = 0;

  for (const qa of Object.values(evaluations)) {
    const nonStale = (qa.attempts || []).filter((a) => !a.stale);
    if (nonStale.length > 0) {
      hasAttempts = true;
      totalAttempts += nonStale.length;
      highestScore += Math.max(...nonStale.map((a) => a.score));
      maxScore += nonStale[0].max_score;
    }
  }

  return {
    has_attempts: hasAttempts,
    highest_score: highestScore,
    max_score: maxScore,
    total_attempts: totalAttempts,
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
    .select("*")
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
  };

  // Add student_id if provided
  if (options?.studentId) {
    insertData.student_id = options.studentId;
  }

  const { data, error } = await supabase
    .from("submissions")
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error("Error creating submission:", error);
    throw error;
  }

  return data;
}

/**
 * Get submission by student ID and assignment ID (for authenticated students)
 */
export async function getSubmissionByStudentAndAssignment(
  studentId: string,
  assignmentId: string
): Promise<Submission | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("submissions")
    .select("*")
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
 * Update or add an answer for a specific question (legacy path)
 * Merges with existing evaluations array
 */
export async function updateSubmissionAnswer(
  submissionId: string,
  questionOrder: number,
  answerText: string
): Promise<Submission> {
  const supabase = createClient();

  // First, get the current evaluations
  const { data: currentSubmission, error: fetchError } = await supabase
    .from("submissions")
    .select("evaluations")
    .eq("submission_id", submissionId)
    .single();

  if (fetchError) {
    console.error("Error fetching submission:", fetchError);
    throw fetchError;
  }

  // Update the evaluations array
  const evals = currentSubmission.evaluations as SubmissionAnswer[];
  const existingAnswerIndex = evals.findIndex(
    (a) => a.question_order === questionOrder
  );

  if (existingAnswerIndex >= 0) {
    // Update existing answer
    evals[existingAnswerIndex].answer_text = answerText;
  } else {
    // Add new answer
    evals.push({ question_order: questionOrder, answer_text: answerText });
  }

  // Save updated evaluations
  const { data, error } = await supabase
    .from("submissions")
    .update({
      evaluations: evals,
      updated_at: new Date().toISOString(),
    })
    .eq("submission_id", submissionId)
    .select()
    .single();

  if (error) {
    console.error("Error updating submission answer:", error);
    throw error;
  }

  return data;
}

/**
 * Mark a submission as completed
 * Sets status to 'completed' and updates submitted_at timestamp
 */
export async function completeSubmission(
  submissionId: string
): Promise<Submission> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("submissions")
    .update({
      status: "completed",
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("submission_id", submissionId)
    .select()
    .single();

  if (error) {
    console.error("Error completing submission:", error);
    throw error;
  }

  return data;
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
    .select("*")
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
 * Get all submissions for a specific assignment
 */
export async function getSubmissionsByAssignment(
  assignmentId: string
): Promise<Submission[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .eq("assignment_id", assignmentId)
    .order("submitted_at", { ascending: false });

  if (error) {
    console.error("Error fetching submissions:", error);
    throw error;
  }

  return data || [];
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
 * Get all attempts for a specific question
 * @param excludeStale - If true, filters out stale attempts (default: false)
 */
export async function getQuestionAttempts(
  submissionId: string,
  questionOrder: number,
  excludeStale: boolean = false
): Promise<SubmissionAttempt[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("submissions")
    .select("evaluations")
    .eq("submission_id", submissionId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
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

  let evaluations = data.evaluations as
    | { [key: number]: QuestionEvaluations }
    | SubmissionAnswer[];

  if (!isNewFormat(evaluations)) {
    evaluations = convertToNewFormat(evaluations);
  }

  const attempts = evaluations[questionOrder]?.attempts || [];

  if (excludeStale) {
    return attempts.filter((attempt) => !attempt.stale);
  }

  return attempts;
}

/**
 * Get the latest or best attempt for a question
 * Excludes stale attempts when finding the best score
 */
export async function getQuestionBestAttempt(
  submissionId: string,
  questionOrder: number
): Promise<SubmissionAttempt | null> {
  const attempts = await getQuestionAttempts(
    submissionId,
    questionOrder,
    true
  );

  if (attempts.length === 0) return null;

  return attempts.reduce((best, current) =>
    current.score > best.score ? current : best
  );
}

/**
 * Select which attempt should count for final grading
 */
export async function selectAttemptForGrading(
  submissionId: string,
  questionOrder: number,
  attemptNumber: number
): Promise<Submission> {
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

  if (evaluations[questionOrder]) {
    evaluations[questionOrder].selected_attempt = attemptNumber;
  }

  const { data, error } = await supabase
    .from("submissions")
    .update({
      evaluations: evaluations,
      updated_at: new Date().toISOString(),
    })
    .eq("submission_id", submissionId)
    .select()
    .single();

  if (error) {
    console.error("Error updating submission:", error);
    throw error;
  }

  return data;
}

/**
 * Get the number of attempts for a specific question
 * Excludes stale attempts from the count
 */
export async function getAttemptCountForQuestion(
  submissionId: string,
  questionOrder: number
): Promise<number> {
  const attempts = await getQuestionAttempts(
    submissionId,
    questionOrder,
    true
  );
  return attempts.length;
}

/**
 * Get the maximum number of attempts across all questions in a submission
 * Excludes stale attempts from the count
 */
export async function getMaxAttemptCountAcrossQuestions(
  submissionId: string
): Promise<number> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("submissions")
    .select("evaluations")
    .eq("submission_id", submissionId)
    .single();

  if (error) {
    console.error("Error fetching submission:", error);
    return 0;
  }

  let evaluations = data.evaluations as
    | { [key: number]: QuestionEvaluations }
    | SubmissionAnswer[];

  if (!isNewFormat(evaluations)) {
    evaluations = convertToNewFormat(evaluations);
  }

  let maxAttempts = 0;
  Object.values(evaluations).forEach((questionEvals) => {
    const qa = questionEvals as QuestionEvaluations;
    if (qa.attempts) {
      const nonStaleCount = qa.attempts.filter(
        (attempt) => !attempt.stale
      ).length;
      if (nonStaleCount > maxAttempts) {
        maxAttempts = nonStaleCount;
      }
    }
  });

  return maxAttempts;
}

/**
 * Reset submission status to in_progress to allow retake
 */
export async function resetSubmissionForRetake(
  submissionId: string
): Promise<Submission> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("submissions")
    .update({
      status: "in_progress",
      updated_at: new Date().toISOString(),
    })
    .eq("submission_id", submissionId)
    .select()
    .single();

  if (error) {
    console.error("Error resetting submission:", error);
    throw error;
  }

  return data;
}

// ---------------------------------------------------------------------------
// Submission analysis helpers (operate on in-memory Submission objects)
// ---------------------------------------------------------------------------

/**
 * Helper: Check if a submission has any non-stale attempts
 */
export function hasNonStaleAttempts(submission: Submission): boolean {
  if (!submission.evaluations || submission.evaluations === null) {
    return false;
  }

  let evalsRaw = submission.evaluations;
  if (typeof evalsRaw === "string") {
    try {
      evalsRaw = JSON.parse(evalsRaw);
    } catch {
      return false;
    }
  }

  if (Array.isArray(evalsRaw)) {
    evalsRaw = convertToNewFormat(evalsRaw);
  }

  if (typeof evalsRaw !== "object" || evalsRaw === null) {
    return false;
  }

  const keys = Object.keys(evalsRaw);
  if (keys.length === 0) {
    return false;
  }

  const evaluations = evalsRaw as
    | { [key: number]: QuestionEvaluations }
    | { [key: string]: QuestionEvaluations }
    | SubmissionAnswer[];

  for (const [, questionEvals] of Object.entries(evaluations)) {
    const qa = questionEvals as QuestionEvaluations;

    if (
      qa &&
      qa.attempts &&
      Array.isArray(qa.attempts) &&
      qa.attempts.length > 0
    ) {
      const hasNonStale = qa.attempts.some((attempt) => !attempt.stale);
      if (hasNonStale) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get the highest score across all questions and attempts in a submission
 * Only considers non-stale attempts
 */
export function getHighestScoreFromSubmission(submission: Submission): {
  highestScore: number;
  maxScore: number;
} {
  if (!submission.evaluations) {
    return { highestScore: 0, maxScore: 0 };
  }

  let evaluations = submission.evaluations as
    | { [key: number]: QuestionEvaluations }
    | SubmissionAnswer[];

  if (!isNewFormat(evaluations)) {
    evaluations = convertToNewFormat(evaluations);
  }

  let highestScore = 0;
  let maxScore = 0;

  Object.values(evaluations).forEach((questionEvals) => {
    const qa = questionEvals as QuestionEvaluations;
    if (qa && qa.attempts && Array.isArray(qa.attempts)) {
      const nonStaleAttempts = qa.attempts.filter(
        (attempt) => !attempt.stale
      );

      if (nonStaleAttempts.length > 0) {
        const questionHighest = Math.max(
          ...nonStaleAttempts.map((attempt) => attempt.score)
        );
        highestScore += questionHighest;
        maxScore += nonStaleAttempts[0].max_score;
      }
    }
  });

  return { highestScore, maxScore };
}

/**
 * Get total count of non-stale attempts across all questions in a submission
 */
export function getTotalAttemptCountFromSubmission(
  submission: Submission
): number {
  if (!submission.evaluations) {
    return 0;
  }

  let evaluations = submission.evaluations as
    | { [key: number]: QuestionEvaluations }
    | SubmissionAnswer[];

  if (!isNewFormat(evaluations)) {
    evaluations = convertToNewFormat(evaluations);
  }

  let totalAttempts = 0;

  Object.values(evaluations).forEach((questionEvals) => {
    const qa = questionEvals as QuestionEvaluations;
    if (qa && qa.attempts && Array.isArray(qa.attempts)) {
      totalAttempts += qa.attempts.filter(
        (attempt) => !attempt.stale
      ).length;
    }
  });

  return totalAttempts;
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
): Promise<Submission> {
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

  // Mark all attempts as stale
  Object.values(evaluations).forEach((questionEvals) => {
    const qa = questionEvals as QuestionEvaluations;
    if (qa.attempts) {
      qa.attempts.forEach((attempt) => {
        attempt.stale = true;
      });
    }
  });

  // Update the submission with stale evaluations and reset denormalized columns
  const { data, error } = await supabase
    .from("submissions")
    .update({
      evaluations: evaluations,
      has_attempts: false,
      highest_score: 0,
      max_score: 0,
      total_attempts: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("submission_id", submissionId)
    .select()
    .single();

  if (error) {
    console.error("Error marking attempts as stale:", error);
    throw error;
  }

  return data;
}

// ---------------------------------------------------------------------------
// Teacher list-view queries (use denormalized columns, exclude JSONB)
// ---------------------------------------------------------------------------

/** Columns to select for list views (excludes evaluations JSONB) */
const SUBMISSION_LIST_COLUMNS =
  "id, submission_id, assignment_id, student_id, responder_details, preferred_language, submission_mode, status, submitted_at, created_at, updated_at, experience_rating, experience_rating_feedback, has_attempts, highest_score, max_score, total_attempts";

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
}

/**
 * Get all students in a class with their submission status for an assignment.
 * Uses denormalized columns -- does NOT fetch the evaluations JSONB.
 */
export async function getSubmissionsByAssignmentWithStudents(
  assignmentId: string,
  classId: string
): Promise<StudentSubmissionStatus[]> {
  const supabase = createClient();

  const [students, { data: allSubmissions, error: submissionsError }] =
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

    if (!submission) {
      status = "not_started";
    } else {
      // Read directly from denormalized columns
      hasAttempts = submission.has_attempts;
      totalAttempts = submission.total_attempts;

      if (hasAttempts) {
        status = "completed";
        highestScore = submission.highest_score;
        maxScore = submission.max_score;
      } else {
        status = "started";
      }
    }

    return {
      student,
      submission,
      status,
      hasAttempts,
      highestScore,
      maxScore,
      totalAttempts,
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
    let status: "completed" | "started";
    let highestScore: number | undefined;
    let maxScore: number | undefined;

    if (hasAttempts) {
      status = "completed";
      highestScore = submission.highest_score;
      maxScore = submission.max_score;
    } else {
      status = "started";
    }

    return {
      submission,
      status,
      hasAttempts,
      highestScore,
      maxScore,
      totalAttempts,
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
