import type { SupabaseClient } from "@supabase/supabase-js";

import type { AiConfigSource } from "@/types/aiSettings";

export type ChatMessageRole = "student" | "assistant";

export interface ChatMessageAiMetadata {
  aiKeySource: AiConfigSource;
  aiProvider: string;
  aiModelId: string;
}

export interface InsertChatMessageInput {
  submission_id: string | null;
  assignment_id: string;
  question_order: number;
  role: ChatMessageRole;
  content: string;
  attempt_number: number | null;
  aiMetadata?: ChatMessageAiMetadata;
}

export async function insertChatMessage(
  supabase: SupabaseClient,
  row: InsertChatMessageInput,
): Promise<void> {
  const payload: Record<string, unknown> = {
    submission_id: row.submission_id,
    assignment_id: row.assignment_id,
    question_order: row.question_order,
    role: row.role,
    content: row.content,
    attempt_number: row.attempt_number,
  };

  if (row.aiMetadata) {
    payload.ai_key_source = row.aiMetadata.aiKeySource;
    payload.ai_provider = row.aiMetadata.aiProvider;
    payload.ai_model_id = row.aiMetadata.aiModelId;
  }

  const { error } = await supabase.from("chat_messages").insert(payload);
  if (error) throw error;
}
