/**
 * Activity tracking types for logging student time spent on platform components
 */

export type ComponentType =
  | "assignment"
  | "question"
  | "learning_content"
  | "quiz"
  | "survey";

/**
 * Semantic event taxonomy for student-only click tracking.
 *
 * Durations and engagement metrics are derived downstream from ordered
 * event timestamps; there is no raw time tracking.
 */
export type EventType =
  // Pre-existing lifecycle events
  | "attempt_started"
  | "attempt_ended"
  | "bot_connect_initiated"
  | "bot_disconnected"
  // Navigation / lifecycle
  | "content_item_opened"
  | "component_closed"
  | "navigation_back_clicked"
  // Intent-level actions
  | "submit_clicked"
  | "question_next_clicked"
  | "question_previous_clicked"
  | "upload_started"
  | "upload_completed"
  | "marked_complete_clicked";

export type InteractionSource =
  | "click"
  | "lifecycle"
  | "async_callback"
  | "system";

/**
 * Whitelist of allowed event types, kept in sync with the API route validator.
 */
export const ALLOWED_EVENT_TYPES: ReadonlyArray<EventType> = [
  "attempt_started",
  "attempt_ended",
  "bot_connect_initiated",
  "bot_disconnected",
  "content_item_opened",
  "component_closed",
  "navigation_back_clicked",
  "submit_clicked",
  "question_next_clicked",
  "question_previous_clicked",
  "upload_started",
  "upload_completed",
  "marked_complete_clicked",
] as const;

/**
 * Input for creating an activity event (semantic click/lifecycle event).
 *
 * `eventId` is a client-generated UUID and is required for idempotent
 * ingestion (so retries / Strict Mode double-fires don't create duplicates).
 * `clientTs` is device time at emit for latency analysis only; the server's
 * `created_at` is the source of truth for ordering.
 */
export interface ActivityEventInput {
  eventId: string;
  userId?: string;
  submissionId?: string;
  classId?: string;
  componentType: ComponentType;
  componentId: string;
  subComponentId?: string;
  eventType: EventType;
  interactionSource?: InteractionSource;
  clientTs?: string; // ISO 8601; generated at emit
}

/**
 * Activity event record from database
 */
export interface ActivityEvent extends ActivityEventInput {
  id: string;
  createdAt: string;
}

/**
 * Options for the useActivityTracking hook
 */
export interface ActivityTrackingOptions {
  componentType: ComponentType;
  componentId: string;
  subComponentId?: string;
  submissionId?: string;
  classId?: string;
  userId?: string;
}

/**
 * Return type for the useActivityTracking hook
 */
export interface ActivityTrackingReturn {
  /** Log an event (attempt_started or attempt_ended) */
  logEvent: (eventType: EventType) => Promise<void>;
}
