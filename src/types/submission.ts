export interface SubmissionAnswer {
  question_order: number;
  answer_text: string;
}

export interface Submission {
  id: string;
  submission_id: string;
  assignment_id: string;
  student_name: string;
  preferred_language: string;
  answers: SubmissionAnswer[];
  submitted_at: string;
  status: "in_progress" | "completed";
}

