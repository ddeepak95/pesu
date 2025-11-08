import { createClient } from "@/lib/supabase";
import { Submission, SubmissionAnswer } from "@/types/submission";
import { nanoid } from "nanoid";

/**
 * Generate a unique short submission ID
 */
function generateSubmissionId(): string {
  return nanoid(8); // 8 characters: e.g., "x7k9m2pq"
}

/**
 * Create a new submission record
 * Initializes with empty answers array and in_progress status
 */
export async function createSubmission(
  assignmentId: string,
  studentName: string,
  preferredLanguage: string
): Promise<Submission> {
  const supabase = createClient();
  const submissionId = generateSubmissionId();

  const { data, error } = await supabase
    .from("submissions")
    .insert({
      submission_id: submissionId,
      assignment_id: assignmentId,
      student_name: studentName,
      preferred_language: preferredLanguage,
      answers: [],
      status: "in_progress",
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating submission:", error);
    throw error;
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
    .single();

  if (error) {
    console.error("Error fetching submission:", error);
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

