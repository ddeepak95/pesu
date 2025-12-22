import { createClient } from "@/lib/supabase";
import {
  Submission,
  SubmissionAnswer,
  SubmissionAttempt,
  QuestionAnswers,
} from "@/types/submission";
import { nanoid } from "nanoid";
import { getClassStudentsWithInfo, StudentWithInfo } from "./students";

/**
 * Generate a unique short submission ID
 */
function generateSubmissionId(): string {
  return nanoid(8); // 8 characters: e.g., "x7k9m2pq"
}

/**
 * Create a new submission record
 * Initializes with empty answers array and in_progress status
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
    responderDetails?: Record<string, any>;
  }
): Promise<Submission> {
  const supabase = createClient();
  const submissionId = generateSubmissionId();

  // Build responder_details
  let responderDetails: Record<string, any> | undefined;
  let studentName: string | undefined;

  if (options?.studentId) {
    // Authenticated student: get display name from user metadata
    const { data: userData } = await supabase.auth.getUser();
    const displayName =
      userData?.user?.user_metadata?.display_name ||
      userData?.user?.user_metadata?.name ||
      userData?.user?.email?.split("@")[0] ||
      "Student";
    responderDetails = { name: displayName };
    studentName = displayName; // For backward compatibility
  } else if (options?.responderDetails) {
    // Public submission: use provided responder details
    responderDetails = options.responderDetails;
    studentName = responderDetails.name || responderDetails.email || "Responder"; // For backward compatibility
  } else {
    throw new Error("Either studentId or responderDetails must be provided");
  }

  const insertData: any = {
    submission_id: submissionId,
    assignment_id: assignmentId,
    preferred_language: preferredLanguage,
    submission_mode: submissionMode,
    answers: {},
    status: "in_progress",
    responder_details: responderDetails,
  };

  // Add student_id if provided
  if (options?.studentId) {
    insertData.student_id = options.studentId;
  }

  // Add student_name for backward compatibility
  if (studentName) {
    insertData.student_name = studentName;
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
 * Update or add an answer for a specific question
 * Merges with existing answers array
 */
export async function updateSubmissionAnswer(
  submissionId: string,
  questionOrder: number,
  answerText: string
): Promise<Submission> {
  const supabase = createClient();

  // First, get the current submission
  const { data: currentSubmission, error: fetchError } = await supabase
    .from("submissions")
    .select("*")
    .eq("submission_id", submissionId)
    .single();

  if (fetchError) {
    console.error("Error fetching submission:", fetchError);
    throw fetchError;
  }

  // Update the answers array
  const answers = currentSubmission.answers as SubmissionAnswer[];
  const existingAnswerIndex = answers.findIndex(
    (a) => a.question_order === questionOrder
  );

  if (existingAnswerIndex >= 0) {
    // Update existing answer
    answers[existingAnswerIndex].answer_text = answerText;
  } else {
    // Add new answer
    answers.push({ question_order: questionOrder, answer_text: answerText });
  }

  // Save updated answers
  const { data, error } = await supabase
    .from("submissions")
    .update({
      answers: answers,
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
    .maybeSingle(); // Use maybeSingle() instead of single() to return null instead of error when not found

  if (error) {
    // Only log actual errors (not "not found" cases)
    // PGRST116 is the code for "no rows returned" which is expected when submission doesn't exist
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

/**
 * Helper: Check if submission uses new attempt-based format
 */
function isNewFormat(
  answers: { [key: number]: QuestionAnswers } | SubmissionAnswer[]
): answers is { [key: number]: QuestionAnswers } {
  return !Array.isArray(answers);
}

/**
 * Helper: Convert old format to new format
 */
function convertToNewFormat(
  oldAnswers: SubmissionAnswer[]
): { [key: number]: QuestionAnswers } {
  const newAnswers: { [key: number]: QuestionAnswers } = {};
  oldAnswers.forEach((answer) => {
    newAnswers[answer.question_order] = {
      attempts: [
        {
          attempt_number: 1,
          answer_text: answer.answer_text,
          score: 0,
          max_score: 0,
          rubric_scores: [],
          evaluation_feedback: "",
          timestamp: new Date().toISOString(),
          stale: false, // Default to not stale for backward compatibility
        },
      ],
      selected_attempt: 1,
    };
  });
  return newAnswers;
}

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
    .select("answers")
    .eq("submission_id", submissionId)
    .single();

  if (error) {
    console.error("Error fetching submission:", error);
    throw error;
  }

  let answers = data.answers as
    | { [key: number]: QuestionAnswers }
    | SubmissionAnswer[];

  if (!isNewFormat(answers)) {
    answers = convertToNewFormat(answers);
  }

  const attempts = answers[questionOrder]?.attempts || [];
  
  if (excludeStale) {
    return attempts.filter((attempt) => !attempt.stale || attempt.stale === false);
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
  // Exclude stale attempts when finding best attempt
  const attempts = await getQuestionAttempts(submissionId, questionOrder, true);

  if (attempts.length === 0) return null;

  // Return the attempt with highest score
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
    .select("answers")
    .eq("submission_id", submissionId)
    .single();

  if (fetchError) {
    console.error("Error fetching submission:", fetchError);
    throw fetchError;
  }

  let answers = currentSubmission.answers as
    | { [key: number]: QuestionAnswers }
    | SubmissionAnswer[];

  if (!isNewFormat(answers)) {
    answers = convertToNewFormat(answers);
  }

  if (answers[questionOrder]) {
    answers[questionOrder].selected_attempt = attemptNumber;
  }

  const { data, error } = await supabase
    .from("submissions")
    .update({
      answers: answers,
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
  const attempts = await getQuestionAttempts(submissionId, questionOrder, true);
  return attempts.length;
}

/**
 * Get the maximum number of attempts across all questions in a submission
 * This represents how many times the student has attempted the assignment
 * Excludes stale attempts from the count
 */
export async function getMaxAttemptCountAcrossQuestions(
  submissionId: string
): Promise<number> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("submissions")
    .select("answers")
    .eq("submission_id", submissionId)
    .single();

  if (error) {
    console.error("Error fetching submission:", error);
    return 0;
  }

  let answers = data.answers as
    | { [key: number]: QuestionAnswers }
    | SubmissionAnswer[];

  if (!isNewFormat(answers)) {
    answers = convertToNewFormat(answers);
  }

  let maxAttempts = 0;
  Object.values(answers).forEach((questionAnswers) => {
    const qa = questionAnswers as QuestionAnswers;
    if (qa.attempts) {
      // Count only non-stale attempts
      const nonStaleCount = qa.attempts.filter(
        (attempt) => !attempt.stale || attempt.stale === false
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

/**
 * Helper: Check if a submission has any non-stale attempts
 */
export function hasNonStaleAttempts(submission: Submission): boolean {
  if (!submission.answers || submission.answers === null) {
    return false;
  }

  // Handle case where answers might be a JSON string (shouldn't happen with Supabase, but just in case)
  let answersRaw = submission.answers;
  if (typeof answersRaw === 'string') {
    try {
      answersRaw = JSON.parse(answersRaw);
    } catch (e) {
      return false;
    }
  }

  // Check if it's an array (old format) or object (new format)
  if (Array.isArray(answersRaw)) {
    // Old format - convert to new format
    const converted = convertToNewFormat(answersRaw);
    answersRaw = converted;
  }

  // Now check if it's an object with keys
  if (typeof answersRaw !== 'object' || answersRaw === null) {
    return false;
  }

  const keys = Object.keys(answersRaw);
  if (keys.length === 0) {
    return false;
  }

  let answers = answersRaw as
    | { [key: number]: QuestionAnswers }
    | { [key: string]: QuestionAnswers }
    | SubmissionAnswer[];

  // Handle both string and number keys (PostgreSQL JSONB may stringify keys)
  for (const [key, questionAnswers] of Object.entries(answers)) {
    const qa = questionAnswers as QuestionAnswers;
    
    if (qa && qa.attempts && Array.isArray(qa.attempts) && qa.attempts.length > 0) {
      // Check if there's at least one non-stale attempt
      // If stale is undefined/null, it's not stale (backward compatibility)
      const hasNonStale = qa.attempts.some(
        (attempt) => {
          const isNotStale = attempt.stale === undefined || attempt.stale === false || !attempt.stale;
          return isNotStale;
        }
      );
      
      if (hasNonStale) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Mark all attempts in a submission as stale
 * This allows students to start fresh while preserving history
 */
export async function markAttemptsAsStale(
  submissionId: string
): Promise<Submission> {
  const supabase = createClient();

  // Get the current submission
  const { data: currentSubmission, error: fetchError } = await supabase
    .from("submissions")
    .select("answers")
    .eq("submission_id", submissionId)
    .single();

  if (fetchError) {
    console.error("Error fetching submission:", fetchError);
    throw fetchError;
  }

  let answers = currentSubmission.answers as
    | { [key: number]: QuestionAnswers }
    | SubmissionAnswer[];

  if (!isNewFormat(answers)) {
    answers = convertToNewFormat(answers);
  }

  // Mark all attempts as stale
  Object.values(answers).forEach((questionAnswers) => {
    const qa = questionAnswers as QuestionAnswers;
    if (qa.attempts) {
      qa.attempts.forEach((attempt) => {
        attempt.stale = true;
      });
    }
  });

  // Update the submission
  const { data, error } = await supabase
    .from("submissions")
    .update({
      answers: answers,
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

/**
 * Student submission status for teacher view
 */
export interface StudentSubmissionStatus {
  student: StudentWithInfo;
  submission: Submission | null;
  status: "completed" | "in_progress" | "not_started";
  hasAttempts: boolean;
}

/**
 * Get all students in a class with their submission status for an assignment
 * Returns students with completion status based on having at least one non-stale attempt
 */
export async function getSubmissionsByAssignmentWithStudents(
  assignmentId: string,
  classId: string
): Promise<StudentSubmissionStatus[]> {
  const supabase = createClient();

  // Get all students in the class
  const students = await getClassStudentsWithInfo(classId);

  // For each student, get their most recent submission for this assignment
  // This is more reliable than trying to match from a list of all submissions
  const submissionMap = new Map<string, Submission>();
  
  // Fetch submissions for all students in parallel
  const submissionPromises = students.map(async (student) => {
    try {
      const submission = await getSubmissionByStudentAndAssignment(
        student.student_id,
        assignmentId
      );
      if (submission) {
        submissionMap.set(student.student_id, submission);
      }
    } catch (error) {
      console.error(`Error fetching submission for student ${student.student_id}:`, error);
    }
  });

  await Promise.all(submissionPromises);

  // Match students with submissions and determine status
  const result: StudentSubmissionStatus[] = students.map((student) => {
    const submission = submissionMap.get(student.student_id) || null;
    let hasAttempts = false;
    if (submission) {
      try {
        hasAttempts = hasNonStaleAttempts(submission);
      } catch (error) {
        console.error("Error checking attempts for submission:", submission.submission_id, error);
        // If there's an error, check if answers exist at all
        hasAttempts = !!(submission.answers && typeof submission.answers === 'object' && Object.keys(submission.answers).length > 0);
      }
    }

    let status: "completed" | "in_progress" | "not_started";
    if (!submission) {
      status = "not_started";
    } else if (hasAttempts) {
      // Student has at least one non-stale attempt - mark as completed
      status = "completed";
    } else {
      // Submission exists but no attempts yet
      status = "in_progress";
    }

    return {
      student,
      submission,
      status,
      hasAttempts,
    };
  });

  return result;
}

