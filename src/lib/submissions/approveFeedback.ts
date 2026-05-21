import type { SupabaseClient } from "@supabase/supabase-js";

import { computeDenormalizedFields } from "@/lib/queries/submissions";
import type {
  QuestionEvaluations,
  RubricScore,
  SubmissionAttempt,
} from "@/types/submission";

export interface ApproveAttemptEdits {
  evaluation_feedback?: string;
  rubric_scores?: RubricScore[];
}

export function isPendingApprovalAttempt(attempt: SubmissionAttempt): boolean {
  return (
    attempt.feedback_approved === false &&
    !attempt.is_evaluating &&
    !attempt.stale
  );
}

/**
 * Mark one attempt approved in an evaluations map (mutates `evaluations`).
 * Returns the updated attempt, or null if not found.
 */
export function approveAttemptInEvaluations(
  evaluations: { [key: number]: QuestionEvaluations },
  questionOrder: number,
  attemptNumber: number,
  edits?: ApproveAttemptEdits
): SubmissionAttempt | null {
  const questionEvals = evaluations[questionOrder];
  if (!questionEvals) return null;

  const attemptIndex = questionEvals.attempts.findIndex(
    (a) => a.attempt_number === attemptNumber
  );
  if (attemptIndex === -1) return null;

  const existingAttempt = questionEvals.attempts[attemptIndex];
  const updatedAttempt: SubmissionAttempt = {
    ...existingAttempt,
    ...(edits?.evaluation_feedback !== undefined && {
      evaluation_feedback: edits.evaluation_feedback,
    }),
    ...(edits?.rubric_scores !== undefined && {
      rubric_scores: edits.rubric_scores,
    }),
    feedback_approved: true,
  };

  questionEvals.attempts[attemptIndex] = updatedAttempt;
  evaluations[questionOrder] = questionEvals;
  return updatedAttempt;
}

/**
 * Approve every pending attempt in the map (mutates `evaluations`).
 * Returns the number of attempts approved.
 */
export function approveAllPendingInEvaluations(evaluations: {
  [key: number]: QuestionEvaluations;
}): number {
  let count = 0;
  for (const questionOrder of Object.keys(evaluations).map(Number)) {
    const questionEvals = evaluations[questionOrder];
    if (!questionEvals?.attempts) continue;
    for (let i = 0; i < questionEvals.attempts.length; i++) {
      const attempt = questionEvals.attempts[i];
      if (!isPendingApprovalAttempt(attempt)) continue;
      questionEvals.attempts[i] = { ...attempt, feedback_approved: true };
      count += 1;
    }
    evaluations[questionOrder] = questionEvals;
  }
  return count;
}

export async function notifyFeedbackAvailable(
  supabase: SupabaseClient,
  params: {
    studentId: string;
    assignmentPublicId: string;
    assignmentTitle: string;
    classDbId: string;
  }
): Promise<void> {
  const { data: classRow } = await supabase
    .from("classes")
    .select("class_id")
    .eq("id", params.classDbId)
    .single();

  const shortClassId = classRow?.class_id;
  const navPath = shortClassId
    ? `/student/classes/${shortClassId}/assignments/${params.assignmentPublicId}`
    : null;

  if (!navPath) return;

  await supabase.from("student_notifications").insert({
    student_id: params.studentId,
    type: "feedback_available",
    title: "Feedback available",
    message: `Your feedback for "${params.assignmentTitle}" is ready to view.`,
    data: {
      nav_path: navPath,
      assignment_title: params.assignmentTitle,
    },
  });
}

export async function saveApprovedEvaluations(
  supabase: SupabaseClient,
  submissionId: string,
  evaluations: { [key: number]: QuestionEvaluations }
): Promise<{ error: Error | null }> {
  const denormalized = computeDenormalizedFields(evaluations);
  const { error } = await supabase
    .from("submissions")
    .update({
      evaluations,
      ...denormalized,
      updated_at: new Date().toISOString(),
    })
    .eq("submission_id", submissionId);

  if (error) {
    return { error: new Error(error.message) };
  }
  return { error: null };
}
