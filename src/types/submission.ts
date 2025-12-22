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
  /**
   * @deprecated Use responder_details.name or derive from user metadata
   * Kept for backward compatibility
   */
  student_name?: string;
  /**
   * Student ID for authenticated submissions (references auth.users)
   */
  student_id?: string | null;
  /**
   * Responder details as key-value pairs
   * For authenticated: {name: "John Doe"} (derived from user metadata)
   * For public: all collected fields from responder_fields_config
   */
  responder_details?: Record<string, any>;
  preferred_language: string;
  answers: { [question_order: number]: QuestionAnswers } | SubmissionAnswer[]; // Support both formats
  submitted_at: string;
  status: "in_progress" | "completed";
  created_at?: string;
  updated_at?: string;
}

