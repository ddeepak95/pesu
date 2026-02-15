export type ContentItemType = "quiz" | "learning_content" | "formative_assignment" | "survey";

export interface ContentItem {
  id: string; // uuid pk
  content_item_id: string; // short id
  class_id: string; // classes.id (uuid)
  class_group_id?: string | null;
  type: ContentItemType;
  ref_id: string; // uuid of underlying row (assignments.id, quizzes.id, learning_contents.id)
  position: number;
  due_at?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  status: "draft" | "active" | "deleted";
  lock_after_complete?: boolean;
  require_teacher_unlock?: boolean;
  unlock_days_after_previous?: number | null;
}

export interface TeacherContentUnlock {
  id: string;
  content_item_id: string;
  student_id: string;
  unlocked_by: string;
  unlocked_at: string;
}




