/**
 * display_content action handler.
 *
 * Pass-through: the orchestrator already provides the markdown content in the
 * ActionInput, so no secondary LLM call is needed. The handler persists the
 * payload and emits the action_payload SSE event.
 */

import { insertChatMessageAction } from "@/lib/queries/chatMessageActions";
import type { DisplayContentActionPayload } from "./types";
import type { DispatchActionArgs } from "./dispatcher";
import type { ActionInput } from "./schema";

type DisplayContentAction = Extract<ActionInput, { kind: "display_content" }>;

export async function handleDisplayContentAction(
  args: DispatchActionArgs & { action: DisplayContentAction },
): Promise<void> {
  const { id, action, enqueue, supabase, submissionId, chatMessageId } = args;

  const payload: DisplayContentActionPayload = {
    kind: "display_content",
    content: action.content,
    title: action.title,
  };

  await insertChatMessageAction(supabase, {
    id,
    chatMessageId,
    submissionId,
    kind: "display_content",
    payload,
  });

  enqueue({ type: "action_payload", id, kind: "display_content", data: payload });
}
