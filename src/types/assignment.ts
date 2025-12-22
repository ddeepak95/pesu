export interface RubricItem {
  item: string;
  points: number;
}

export interface Question {
  order: number;
  prompt: string;
  total_points: number;
  rubric: RubricItem[];
  supporting_content: string;
}

export interface ResponderFieldConfig {
  field: string; // unique field identifier (e.g., "name", "email", "organization")
  type: "text" | "email" | "tel" | "select";
  label: string; // display label
  required: boolean;
  placeholder?: string;
  options?: string[]; // for select type
}

export interface Assignment {
  id: string;
  assignment_id: string;
  class_id: string;
  class_group_id?: string | null;
  title: string;
  questions: Question[];
  total_points: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  status: "draft" | "active" | "deleted";
  preferred_language: string;
  is_public: boolean;
  /**
   * Assessment delivery mode for this assignment.
   * Defaults to "voice" for legacy assignments where this field is missing.
   */
  assessment_mode?: "voice" | "text_chat" | "static_text";
  /**
   * Configuration for responder details collection in public assignments.
   * Defines what fields to collect from public responders.
   */
  responder_fields_config?: ResponderFieldConfig[];
  /**
   * Maximum number of attempts allowed per student for this assignment.
   * Defaults to 1 if not specified.
   */
  max_attempts?: number;
}

