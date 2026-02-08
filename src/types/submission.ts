// Star rating conversion result
export interface StarRating {
  stars: number;
  maxStars: number;
  percentage: number;
}

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
  // answer_text removed -- now stored in submission_transcripts table
  score: number;
  max_score: number;
  rubric_scores: RubricScore[];
  evaluation_feedback: string;
  timestamp: string;
  stale?: boolean; // Marks attempt as stale when teacher resets attempts
}

export interface QuestionEvaluations {
  attempts: SubmissionAttempt[];
  selected_attempt?: number; // which attempt counts for final grade (default: best score)
}

/**
 * Clean aggregated transcript per attempt, stored in submission_transcripts table.
 * Primary read path for transcript display and session restore.
 */
export interface SubmissionTranscript {
  id: string;
  submission_id: string;
  question_order: number;
  attempt_number: number;
  answer_text: string;
  created_at: string;
}

/**
 * Per-attempt typed text entry for static_text submission mode.
 * Parallels voice_messages (voice) and chat_messages (chat).
 */
export interface StaticActivity {
  id: string;
  submission_id: string;
  assignment_id: string;
  question_order: number;
  attempt_number: number;
  content: string;
  created_at: string;
}

export interface Submission {
  id: string;
  submission_id: string;
  assignment_id: string;
  /**
   * Student ID for authenticated submissions (references auth.users)
   */
  student_id?: string | null;
  /**
   * Responder details as key-value pairs
   * For authenticated: {name: "John Doe"} (derived from user metadata)
   * For public: all collected fields from responder_fields_config
   */
  responder_details?: Record<string, string>;
  preferred_language: string;
  /**
   * Per-question evaluation data (scores, rubric, feedback).
   * Transcripts are stored separately in submission_transcripts table.
   * Renamed from 'answers' since it no longer contains answer text.
   */
  evaluations: { [question_order: number]: QuestionEvaluations } | SubmissionAnswer[];
  submitted_at: string;
  status: "in_progress" | "completed";
  /**
   * The submission mode used for this submission
   * Stored at creation time to preserve historical accuracy
   */
  submission_mode?: "voice" | "text_chat" | "static_text";
  created_at?: string;
  updated_at?: string;
  /**
   * Student experience rating on a 1-5 scale, collected at submission time
   */
  experience_rating?: number | null;
  /**
   * Optional text feedback explaining the experience rating
   */
  experience_rating_feedback?: string | null;
  /**
   * Denormalized columns for list views (avoid parsing evaluations JSONB)
   */
  has_attempts: boolean;
  highest_score: number;
  max_score: number;
  total_attempts: number;
}

