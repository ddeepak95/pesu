/**
 * display_markdown action handler.
 *
 * Pass-through: the orchestrator already provides the markdown content in the
 * ActionInput, so no secondary LLM call is needed. The handler persists the
 * payload and emits the action_payload SSE event.
 */

import { insertChatMessageAction } from "@/lib/queries/chatMessageActions";
import type { DisplayMarkdownActionPayload } from "./types";
import type { DispatchActionArgs } from "./dispatcher";
import type { ActionInput } from "./schema";

type DisplayMarkdownAction = Extract<ActionInput, { kind: "display_markdown" }>;

export async function handleDisplayMarkdownAction(
  args: DispatchActionArgs & { action: DisplayMarkdownAction },
): Promise<void> {
  const { id, action, enqueue, supabase, submissionId, chatMessageId } = args;

  const payload: DisplayMarkdownActionPayload = {
    kind: "display_markdown",
    content: action.content,
    title: action.title,
  };

  await insertChatMessageAction(supabase, {
    id,
    chatMessageId,
    submissionId,
    kind: "display_markdown",
    payload,
  });

  enqueue({ type: "action_payload", id, kind: "display_markdown", data: payload });
}
