export interface ContentCompletion {
  id: string;
  student_id: string;
  content_item_id: string;
  completed_at: string;
  created_at: string;
}

export interface ContentCompletionInput {
  contentItemId: string;
  studentId?: string; // Optional - will use auth.uid() if not provided
}

export type ContentItemType =
  | "quiz"
  | "learning_content"
  | "formative_assignment"
  | "survey";

export interface StudentContentCompletionWithDetails {
  studentId: string;
  studentName: string;
  studentEmail: string | null;
  contentItemId: string;
  contentName: string;
  contentType: ContentItemType;
  isComplete: boolean;
  completedAt: string | null;
  contentGroupId: string | null;
  studentGroupId: string | null;
}
