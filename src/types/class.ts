export interface Class {
  id: string;
  name: string;
  class_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  status: "active" | "deleted";
  preferred_language: string;
}

export interface ClassTeacher {
  id: string;
  class_id: string;
  teacher_id: string;
  role: "owner" | "co-teacher";
  joined_at: string;
}

