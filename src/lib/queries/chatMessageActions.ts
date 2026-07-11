import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ActionKind,
  ActionPayload,
  McqActionPayload,
} from "@/lib/multimodal/actions/types";
import { createClient } from "@/lib/supabase";
import type { PendingAction } from "@/components/Shared/KonvoVoice/actionTypes";

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
  // Upsert on id so a re-run (dispatcher silent retry, or a manual action-retry
  // reusing the same actionId) is idempotent — "persist succeeded but response
  // lost" double-retries don't create duplicate rows. See plan §6.
  const { error } = await supabase.from("chat_message_actions").upsert(
    {
      id: row.id,
      chat_message_id: row.chatMessageId,
      submission_id: row.submissionId,
      kind: row.kind,
      payload: row.payload,
    },
    { onConflict: "id" },
  );
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
 * Fetch all actions for a set of chat message IDs, reconstructed as
 * PendingAction objects (state: "ready") for read-only display.
 */
export async function getChatMessageActionsForMessages(
  chatMessageIds: string[],
): Promise<Record<string, PendingAction>> {
  if (chatMessageIds.length === 0) return {};
  const supabase = createClient();
  const { data, error } = await supabase
    .from("chat_message_actions")
    .select("id, chat_message_id, kind, payload, response")
    .in("chat_message_id", chatMessageIds);
  if (error) throw error;
  const result: Record<string, PendingAction> = {};
  for (const row of data ?? []) {
    result[row.chat_message_id as string] = {
      id: row.id as string,
      kind: row.kind as ActionKind,
      state: "ready",
      payload: (row.payload as ActionPayload) ?? undefined,
      answeredIndex: (row.response as { answeredIndex?: number } | null)
        ?.answeredIndex,
    };
  }
  return result;
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
