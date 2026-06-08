import { createClient } from "@/lib/supabase";

export interface VoiceMessageRow {
  role: "student" | "assistant";
  audio_file_url: string | null;
  created_at: string;
}

export async function getVoiceMessagesForAttempt(
  submissionId: string,
  questionOrder: number,
  attemptNumber: number,
): Promise<VoiceMessageRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("voice_messages")
    .select("role, audio_file_url, created_at")
    .eq("submission_id", submissionId)
    .eq("question_order", questionOrder)
    .eq("attempt_number", attemptNumber)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as VoiceMessageRow[];
}
