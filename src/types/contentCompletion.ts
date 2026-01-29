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
