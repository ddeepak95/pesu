/**
 * Which built-in (non-profile-field) columns show in the unified Students table.
 * Undefined keys fall back to defaults resolved in `studentsTableConfig.ts`:
 * `group` is auto (shown iff the class has >1 group); the rest default to hidden.
 */
export interface ProgressViewColumnConfig {
  /** Group column. Omitted/undefined => auto (shown iff class has >1 group). */
  group?: boolean;
  /** Progress bar (completed/total). Default hidden. */
  progress?: boolean;
  /** Last completed date. Default hidden. */
  last_completed?: boolean;
  /** Pending approvals badge. Default hidden. */
  approvals?: boolean;
}

export interface ProgressViewConfig {
  display_fields: string[];
  filter_fields: string[];
  /** Built-in column visibility for the unified Students table. */
  columns?: ProgressViewColumnConfig;
}

/**
 * Class-level language defaults that seed new assignments. The primary language
 * default itself is `Class.preferred_language`; this config carries the locks and
 * the support-language defaults. "Locked" prevents students from changing the
 * value during an activity (it still seeds the assignment, where the teacher can
 * override per assignment).
 */
export interface ClassLanguageConfig {
  /** Lock the primary language for students (seeds assignment `lock_language`). */
  lockPrimaryLanguage?: boolean;
  /** Pre-enable language support on new assignments. */
  supportLanguageEnabled?: boolean;
  /** Default support language pre-selected for learners (locale code). */
  defaultSupportLanguage?: string;
  /** Lock the support language for students. */
  lockSupportLanguage?: boolean;
}

export interface Class {
  id: string;
  name: string;
  class_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  status: "active" | "deleted" | "archived";
  preferred_language: string;
  language_config?: ClassLanguageConfig | null;
  group_count?: number;
  enable_progressive_unlock?: boolean;
  student_assignment_strategy?: "round_robin" | "default_group";
  progress_view_config?: ProgressViewConfig | null;
  institution_id: string;
}

export type ClassTeacherRole = "owner" | "co-owner" | "admin" | "co-teacher";

export interface ClassTeacher {
  id: string;
  class_id: string;
  teacher_id: string;
  role: ClassTeacherRole;
  joined_at: string;
}

