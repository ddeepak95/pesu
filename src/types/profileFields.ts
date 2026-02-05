export interface ProfileField {
  id: string;
  class_id: string;
  field_name: string;
  field_type: "text" | "dropdown";
  options: string[] | null;
  position: number;
  is_mandatory: boolean;
  is_display_name: boolean;
  created_at: string;
  updated_at: string;
}

export interface StudentProfile {
  id: string;
  class_id: string;
  student_id: string;
  field_responses: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface ProfileFieldInput {
  field_name: string;
  field_type: "text" | "dropdown";
  options?: string[];
  position: number;
  is_mandatory: boolean;
  is_display_name: boolean;
}
