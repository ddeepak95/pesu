import type { FeedbackDoc } from "@/types/feedbackDoc";

// Star rating conversion result
export interface StarRating {
  stars: number;
  maxStars: number;
  percentage: number;
}

// Rubric score (per rubric item) — shared by normalized attempts and AI audit.
export interface RubricScore {
  item: string;
  points_earned: number;
  points_possible: number;
  feedback: string;
}

/**
 * Normalized per-question row (one per question per submission).
 * Mirrors the `submission_questions` table. `selected_attempt_id` drives the counted
 * grade; `released_score` is null until the submission is released.
 */
export interface SubmissionQuestion {
  id: string;
  submission_id: string;
  question_order: number;
  selected_attempt_id: string | null;
  released_score: number | null;
  created_at: string;
}

/**
 * Normalized per-attempt row. Mirrors the `submission_attempts` table; the
 * score/feedback/rubric_scores columns hold the *displayable* grade (AI tentative
 * before release, teacher-final after).
 *
 * `released` is derived at read time from the parent submission's
 * `feedback_released_at` (there is no stored per-attempt release column).
 */
export interface SubmissionAttempt {
  id: string;
  submission_question_id: string;
  attempt_number: number;
  max_score: number;
  stale: boolean;
  score: number | null;
  feedback: string | null;
  /** Structured block document; null for legacy attempts (renders plain `feedback`). */
  feedback_doc: FeedbackDoc | null;
  rubric_scores: RubricScore[] | null;
  created_at: string;
  /** Derived: parent submission.feedback_released_at != null. */
  released: boolean;
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
  submitted_at: string;
  status: "in_progress" | "completed";
  /**
   * The submission mode used for this submission
   * Stored at creation time to preserve historical accuracy
   */
  submission_mode?: "voice" | "static_text" | "multimodal";
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
  /**
   * Whole-submission release flag (normalized schema). null = held/tentative,
   * set = released. Single source of truth for tentative-vs-final.
   */
  feedback_released_at?: string | null;
  /** Σ released_score of released questions (trigger-maintained counted total). */
  graded_score?: number;
  /** Number of questions with at least one non-stale attempt */
  questions_attempted_count?: number;
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
  /**
   * Teacher "Save and Preview" run. Preview submissions exercise the real
   * pipeline but are filtered out of every submission read surface (teacher
   * view, public view, pending-approval badges, analytics). Default false.
   */
  is_preview?: boolean;
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

