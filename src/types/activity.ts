/**
 * Activity tracking types for logging student time spent on platform components
 */

export type ComponentType =
  | "assignment"
  | "question"
  | "learning_content"
  | "quiz";

export type EventType = "attempt_started" | "attempt_ended";

/**
 * Input for creating/updating an activity log (periodic time tracking)
 */
export interface ActivityLogInput {
  sessionId: string; // Stable ID based on component identity, used for upsert
  userId?: string;
  submissionId?: string;
  classId?: string;
  componentType: ComponentType;
  componentId: string;
  subComponentId?: string;
  totalTimeMs: number;
}

/**
 * Input for creating an activity event (start/end timestamps)
 */
export interface ActivityEventInput {
  userId?: string;
  submissionId?: string;
  classId?: string;
  componentType: ComponentType;
  componentId: string;
  subComponentId?: string;
  eventType: EventType;
}

/**
 * Activity log record from database
 */
export interface ActivityLog extends ActivityLogInput {
  id: string;
  createdAt: string;
  updatedAt: string;
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
  /** Auto-save interval in milliseconds (default: 10000 = 10 seconds) */
  autoSaveInterval?: number;
  /** Whether to start tracking immediately (default: true) */
  autoStart?: boolean;
  /** Whether tracking is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Return type for the useActivityTracking hook
 */
export interface ActivityTrackingReturn {
  /** Whether tracking is currently active */
  isTracking: boolean;
  /** Current total time in milliseconds */
  totalTimeMs: number;
  /** Start tracking (if not auto-started) */
  startTracking: () => void;
  /** Stop tracking */
  stopTracking: () => void;
  /** Log an event (attempt_started or attempt_ended) */
  logEvent: (eventType: EventType) => Promise<void>;
}
