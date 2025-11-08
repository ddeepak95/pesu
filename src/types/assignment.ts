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

export interface Assignment {
  id: string;
  assignment_id: string;
  class_id: string;
  title: string;
  questions: Question[];
  total_points: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  status: "active" | "deleted";
  preferred_language: string;
  is_public: boolean;
}

