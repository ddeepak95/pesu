export interface ChatbotConfig {
  image_mode?: "off" | "append" | "replace";
  is_public: boolean;
  title: string;
  language: string;
  lock_language: boolean;
  system_prompt: string;
  turn_limit: number;
  max_conversations: number | null;
  web_search: boolean;
  image_search: boolean;
  status: "draft" | "active";
}

export interface Chatbot extends Omit<ChatbotConfig, "status"> {
  id: string;
  chatbot_id: string;
  class_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  status: "draft" | "active" | "deleted";
}

export interface ChatbotConversation {
  id: string;
  chatbot_id: string;
  student_id: string | null;
  public_participant_id: string | null;
  is_preview: boolean;
  preview_owner_id: string | null;
  sequence: number;
  language: string | null;
  turns_used: number;
  opening_complete: boolean;
  closed_at: string | null;
  pending_message_id: string | null;
  pending_until: string | null;
  created_at: string;
}

export interface ChatbotSource {
  url: string;
  title: string;
}

export interface ChatbotMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  status: "pending" | "complete" | "failed";
  image_mappings?: ChatbotImageMapping[];
  image_matching_invocation_id?: string | null;
  sources: ChatbotSource[];
  search_entry_point: string | null;
  ai_invocation_id: string | null;
  created_at: string;
}

export interface ChatbotImage {
  id: string;
  chatbot_id: string;
  description: string;
  filename: string;
  status: "pending" | "ready" | "removed";
}
export interface ChatbotImageMapping {
  occurrence_id: string;
  original_url: string;
  image_id: string;
  action: "append" | "replace";
  description: string;
}
