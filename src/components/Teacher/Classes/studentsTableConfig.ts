import type { ProgressViewConfig } from "@/types/class";

/**
 * The built-in (non-profile-field) columns of the unified Students table, in
 * display order. `group` is special: it only ever shows when the class has more
 * than one group.
 */
export type StudentColumnKey =
  | "group"
  | "progress"
  | "lastCompleted"
  | "approvals";

export interface ResolvedColumnVisibility {
  group: boolean;
  progress: boolean;
  lastCompleted: boolean;
  approvals: boolean;
}

/**
 * Turn the stored config + the class's group count into concrete booleans.
 * The table, the fetch gates, and the config UI all read from this so they can
 * never disagree.
 *
 * Defaults: `group` follows the config when the class has >1 group (defaulting
 * to shown), and is force-hidden for single-group classes; the three heavy
 * columns default to hidden until explicitly enabled.
 */
export function resolveColumnVisibility(
  cfg: ProgressViewConfig | null | undefined,
  groupCount: number
): ResolvedColumnVisibility {
  const columns = cfg?.columns ?? {};
  return {
    group: groupCount > 1 && (columns.group ?? true),
    progress: columns.progress ?? false,
    lastCompleted: columns.last_completed ?? false,
    approvals: columns.approvals ?? false,
  };
}

/** Whether any enabled column needs the per-student progress summary RPC. */
export function needsProgressSummary(v: ResolvedColumnVisibility): boolean {
  return v.progress || v.lastCompleted;
}

/** Whether any enabled column needs the pending-approvals query. */
export function needsPendingApprovals(v: ResolvedColumnVisibility): boolean {
  return v.approvals;
}

export interface StudentColumnMeta {
  key: StudentColumnKey;
  label: string;
  /** Info-tooltip copy explaining what the column means. */
  tip: string;
}

/**
 * Single source of truth for the built-in column label + tooltip copy, shared
 * by the table header and the Table Config menu. `group` is only offered in the
 * config when the class has more than one group.
 */
export const STUDENT_COLUMN_META: Record<StudentColumnKey, StudentColumnMeta> = {
  group: {
    key: "group",
    label: "Group",
    tip: "The class group each student is assigned to. Only available when the class has more than one group.",
  },
  progress: {
    key: "progress",
    label: "Progress",
    tip: "Share of assigned content each student has completed (completed / total for their group). Loading it fetches per-student progress data.",
  },
  lastCompleted: {
    key: "lastCompleted",
    label: "Last completed",
    tip: "Date each student most recently completed a content item.",
  },
  approvals: {
    key: "approvals",
    label: "Approvals",
    tip: "Flags students with an assignment submission awaiting your approval.",
  },
};
