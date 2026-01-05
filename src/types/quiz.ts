export interface MCQOption {
  id: string;
  text: string;
}

export interface MCQQuestion {
  order: number;
  prompt: string;
  options: MCQOption[];
  correct_option_id: string;
  points: number;
}

export interface Quiz {
  id: string; // uuid pk
  quiz_id: string; // short id
  class_id: string; // classes.id (uuid)
  class_group_id?: string | null;
  title: string;
  questions: MCQQuestion[];
  total_points: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  status: "draft" | "active" | "deleted";
}




