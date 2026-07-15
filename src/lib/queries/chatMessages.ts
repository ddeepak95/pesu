import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase";
import type { AiConfigSource } from "@/types/aiSettings";

export type ChatMessageRole = "student" | "assistant";

export interface ChatMessageAiMetadata {
  aiKeySource: AiConfigSource;
  aiProvider: string;
  aiModelId: string;
}

export interface ChatMessageTranscriptCandidate {
  language: string;
  text: string;
}

export interface InsertChatMessageInput {
  /**
   * Optional explicit primary key. The client mints stable UUIDs for each
   * message bubble; passing it here lets the same id flow into
   * voice_messages.chat_message_id so audio links back by FK. Omit to let the
   * DB generate one.
   */
  id?: string;
  submission_id: string | null;
  assignment_id: string;
  question_order: number;
  question_id: string;
  role: ChatMessageRole;
  content: string;
  attempt_number: number | null;
  session_id?: string | null;
  aiMetadata?: ChatMessageAiMetadata;
  aiInvocationId?: string | null;
  /**
   * Audit copy of the raw dual-transcript STT candidates ([primary, support]
   * language readings) for this student message. Only set for dual-transcript
   * (language-support) turns; omitted for regular single-transcript inserts
   * and assistant messages.
   */
  transcriptCandidates?: ChatMessageTranscriptCandidate[];
}

export async function insertChatMessage(
  supabase: SupabaseClient,
  row: InsertChatMessageInput,
): Promise<string | null> {
  const payload: Record<string, unknown> = {
    submission_id: row.submission_id,
    assignment_id: row.assignment_id,
    question_order: row.question_order,
    question_id: row.question_id,
    role: row.role,
    content: row.content,
    attempt_number: row.attempt_number,
  };

  if (row.id) {
    payload.id = row.id;
  }

  if (row.session_id) {
    payload.session_id = row.session_id;
  }

  if (row.aiMetadata) {
    payload.ai_key_source = row.aiMetadata.aiKeySource;
    payload.ai_provider = row.aiMetadata.aiProvider;
    payload.ai_model_id = row.aiMetadata.aiModelId;
  }

  if (row.aiInvocationId) {
    payload.ai_invocation_id = row.aiInvocationId;
  }

  if (row.transcriptCandidates) {
    payload.transcript_candidates = row.transcriptCandidates;
  }

  // Upsert on the client-minted id so a retried turn is idempotent: the student
  // row from the first (failed) attempt isn't duplicated, and a retried dual-STT
  // turn can overwrite the fallback primary-candidate text with the properly
  // resolved transcript. When no id is supplied (DB-generated), this is a plain
  // insert. See dev-docs/ai-retry-and-failure-recovery-plan.md §5.
  const query = row.id
    ? supabase
        .from("chat_messages")
        .upsert(payload, { onConflict: "id" })
    : supabase.from("chat_messages").insert(payload);

  const { data, error } = await query.select("id").single();

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
  questionId: string,
  attemptNumber: number,
): Promise<ChatMessageRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, role, content")
    .eq("submission_id", submissionId)
    .eq("question_id", questionId)
    .eq("attempt_number", attemptNumber)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ChatMessageRow[];
}
