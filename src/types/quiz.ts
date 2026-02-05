export interface MCQOption {
  id: string;
  text: string;
}

export interface MCQQuestion {
  id: string;
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
  randomize_questions: boolean;
  randomize_options: boolean;
  show_points_to_students: boolean;
  total_points: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  status: "draft" | "active" | "deleted";
}

export interface QuizSubmissionAnswer {
  question_id: string;
  selected_option_id: string;
}

export interface QuizSubmission {
  id: string;
  quiz_id: string;
  class_id: string;
  student_id: string;
  answers: QuizSubmissionAnswer[];
  submitted_at: string | null;
  created_at: string | null;
}



