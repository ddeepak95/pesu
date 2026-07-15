import { createClient } from "@/lib/supabase";

export interface VoiceMessageRow {
  id: string;
  role: "student" | "assistant";
  content: string;
  audio_file_url: string | null;
  created_at: string;
  /** FK to chat_messages.id; null for rows written before the link existed. */
  chat_message_id: string | null;
}

export async function getVoiceMessagesForAttempt(
  submissionId: string,
  questionId: string,
  attemptNumber: number,
): Promise<VoiceMessageRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("voice_messages")
    .select("id, role, content, audio_file_url, created_at, chat_message_id")
    .eq("submission_id", submissionId)
    .eq("question_id", questionId)
    .eq("attempt_number", attemptNumber)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as VoiceMessageRow[];
}
