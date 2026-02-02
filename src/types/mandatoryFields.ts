export interface MandatoryField {
  id: string;
  class_id: string;
  field_name: string;
  field_type: "text" | "dropdown";
  options: string[] | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface StudentClassInfo {
  id: string;
  class_id: string;
  student_id: string;
  field_responses: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface MandatoryFieldInput {
  field_name: string;
  field_type: "text" | "dropdown";
  options?: string[];
  position: number;
}
