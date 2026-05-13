export interface ProgressViewConfig {
  display_fields: string[];
  filter_fields: string[];
}

export interface Class {
  id: string;
  name: string;
  class_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  status: "active" | "deleted";
  preferred_language: string;
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

