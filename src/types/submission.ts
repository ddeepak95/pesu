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
  /**
   * Whether the teacher has approved this attempt's feedback for student viewing.
   * Only present when the assignment has feedback_requires_approval = true.
   * undefined/absent = approved (backward-compatible); false = pending approval.
   */
  feedback_approved?: boolean;
  /**
   * True while the background LLM evaluation is still running (two-step approval flow).
   * The attempt exists in the DB as a stub; score and feedback are placeholders until
   * the process step completes and sets this to false.
   */
  is_evaluating?: boolean;
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
  /** Number of questions with at least one non-stale attempt */
  questions_attempted_count?: number;
  /**
   * True when at least one attempt has feedback_approved = false and is_evaluating = false.
   * Updated on every evaluate / approve write alongside other denormalized fields.
   */
  has_pending_approvals?: boolean;
  /**
   * Client-side activity metrics (optional JSON columns on submissions table)
   * - tab_leave_events: array of ISO timestamps when the student left the tab.
   * - input_violation_events: array of objects describing \"more-than-two-words\" input attempts.
   */
  tab_leave_events?: string[] | null;
  input_violation_events?: { timestamp: string; text: string }[] | null;
  /**
   * When set, the student cannot continue the assessment until a teacher clears the lock.
   */
  integrity_access_revoked_at?: string | null;
  /**
   * Machine-readable reason (e.g. tab_switch_threshold).
   */
  integrity_access_revoked_reason?: string | null;
  /**
   * UUIDs of associated submission_files rows.
   */
  file_ids?: string[] | null;
  /**
   * Dynamically generated questions for this submission (when assignment has dynamic_questions_enabled).
   * Uses the same Question interface as assignment-level questions.
   */
  generated_questions?: import("@/types/assignment").Question[] | null;
  /**
   * Snapshot of file_ids at the time questions were generated.
   * Used to detect file changes that should trigger regeneration.
   */
  generated_from_file_ids?: string[] | null;
  /**
   * Timestamp when dynamic questions were generated for this submission.
   */
  questions_generated_at?: string | null;
}

export interface SubmissionFile {
  id: string;
  submission_id: string;
  assignment_id: string;
  filename: string;
  file_url: string;
  file_size: number;
  mime_type?: string;
  storage_path: string;
  parsed_content_url?: string | null;
  processing_status:
    | "uploading"
    | "uploaded"
    | "processing"
    | "processed"
    | "failed";
  created_at: string;
  updated_at?: string;
}

