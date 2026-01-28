/**
 * Activity tracking types for logging student time spent on platform components
 */

export type ComponentType =
  | "assignment"
  | "question"
  | "attempt"
  | "learning_content"
  | "quiz";

/**
 * Input for creating/updating an activity log
 */
export interface ActivityLogInput {
  sessionId: string; // UUID generated client-side, used for upsert
  userId?: string;
  submissionId?: string;
  classId?: string;
  componentType: ComponentType;
  componentId: string;
  subComponentId?: string;
  totalTimeMs: number;
  activeTimeMs: number;
  idleTimeMs: number;
  hiddenTimeMs: number;
  startedAt: string; // ISO timestamp
  endedAt: string; // ISO timestamp
  metadata?: Record<string, unknown>;
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
 * Options for the useActivityTracking hook
 */
export interface ActivityTrackingOptions {
  componentType: ComponentType;
  componentId: string;
  subComponentId?: string;
  submissionId?: string;
  classId?: string;
  userId?: string;
  /** Idle timeout in milliseconds (default: 30000 = 30 seconds) */
  idleTimeout?: number;
  /** Auto-save interval in milliseconds (default: 60000 = 60 seconds) */
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
  /** Whether the user is currently idle */
  isIdle: boolean;
  /** Whether the page/tab is currently hidden */
  isHidden: boolean;
  /** Current time data */
  timeData: {
    totalTimeMs: number;
    activeTimeMs: number;
    idleTimeMs: number;
    hiddenTimeMs: number;
    startedAt: Date | null;
  };
  /** Start tracking (if not auto-started) */
  startTracking: () => void;
  /** Stop tracking and save to database */
  stopTracking: () => Promise<void>;
  /** Pause tracking temporarily */
  pauseTracking: () => void;
  /** Resume tracking after pause */
  resumeTracking: () => void;
}
