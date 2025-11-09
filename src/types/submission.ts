// Legacy format - kept for backward compatibility
export interface SubmissionAnswer {
  question_order: number;
  answer_text: string;
}

// New format with evaluation support
export interface RubricScore {
  item: string;
  points_earned: number;
  points_possible: number;
  feedback: string;
}

export interface SubmissionAttempt {
  attempt_number: number;
  answer_text: string;
  score: number;
  max_score: number;
  rubric_scores: RubricScore[];
  evaluation_feedback: string;
  timestamp: string;
}

export interface QuestionAnswers {
  attempts: SubmissionAttempt[];
  selected_attempt?: number; // which attempt counts for final grade (default: best score)
}

export interface Submission {
  id: string;
  submission_id: string;
  assignment_id: string;
  student_name: string;
  preferred_language: string;
  answers: { [question_order: number]: QuestionAnswers } | SubmissionAnswer[]; // Support both formats
  submitted_at: string;
  status: "in_progress" | "completed";
  created_at?: string;
  updated_at?: string;
}

