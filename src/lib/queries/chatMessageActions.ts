import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ActionKind,
  ActionPayload,
  McqActionPayload,
} from "@/lib/multimodal/actions/types";

export interface InsertChatMessageActionInput {
  id: string;
  chatMessageId: string;
  submissionId: string | null;
  kind: ActionKind;
  payload: ActionPayload;
}

/**
 * Persist a generated action before it is streamed to the client, so the
 * payload survives a mid-stream disconnect and the session can be replayed.
 */
export async function insertChatMessageAction(
  supabase: SupabaseClient,
  row: InsertChatMessageActionInput,
): Promise<void> {
  const { error } = await supabase.from("chat_message_actions").insert({
    id: row.id,
    chat_message_id: row.chatMessageId,
    submission_id: row.submissionId,
    kind: row.kind,
    payload: row.payload,
  });
  if (error) throw error;
}

/**
 * Most recent MCQ payload for a submission — used to re-present the exact same
 * question on a retry (action.repeatPrevious).
 */
export async function fetchLatestMcqPayload(
  supabase: SupabaseClient,
  submissionId: string | null,
): Promise<McqActionPayload | null> {
  if (!submissionId) return null;
  const { data, error } = await supabase
    .from("chat_message_actions")
    .select("payload")
    .eq("submission_id", submissionId)
    .eq("kind", "mcq")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const payload = data?.payload as McqActionPayload | undefined;
  return payload ?? null;
}

/**
 * Record the learner's MCQ answer in the action's `response` jsonb. `response`
 * is the generic learner-interaction column (e.g. MCQ -> { answeredIndex }),
 * kept separate from the system-generated `payload`.
 */
export async function updateChatMessageActionAnswer(
  supabase: SupabaseClient,
  input: { id: string; answeredIndex: number },
): Promise<void> {
  const { error } = await supabase
    .from("chat_message_actions")
    .update({ response: { answeredIndex: input.answeredIndex } })
    .eq("id", input.id);
  if (error) throw error;
}
