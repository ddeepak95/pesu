export type LearningContentType = "video" | "text" | "mixed";

export interface LearningContent {
  id: string; // uuid pk
  learning_content_id: string; // short id
  class_id: string; // classes.id (uuid)
  class_group_id?: string | null;
  title: string;
  content_type: LearningContentType;
  video_url?: string | null;
  body?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  status: "draft" | "active" | "deleted";
}




