import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase";
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
  aiInvocationId?: string | null;
}

export async function insertChatMessage(
  supabase: SupabaseClient,
  row: InsertChatMessageInput,
): Promise<string | null> {
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

  if (row.aiInvocationId) {
    payload.ai_invocation_id = row.aiInvocationId;
  }

  const { data, error } = await supabase
    .from("chat_messages")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw error;
  return (data?.id as string) ?? null;
}

export interface ChatMessageRow {
  id: string;
  role: ChatMessageRole;
  content: string;
}

export async function getChatMessages(
  submissionId: string,
  questionOrder: number,
  attemptNumber: number,
): Promise<ChatMessageRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, role, content")
    .eq("submission_id", submissionId)
    .eq("question_order", questionOrder)
    .eq("attempt_number", attemptNumber)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ChatMessageRow[];
}
