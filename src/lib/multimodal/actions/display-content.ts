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
import { resolveDocumentFigureGroup } from "@/lib/classDocuments/student";
import { stripPortableFigureImages } from "@/lib/classDocuments/figureMarkdown";

type DisplayContentAction = Extract<ActionInput, { kind: "display_content" }>;

export async function handleDisplayContentAction(
  args: DispatchActionArgs & { action: DisplayContentAction },
): Promise<void> {
  const { id, action, enqueue, supabase, submissionId, chatMessageId } = args;
  let documentFigure: DisplayContentActionPayload["documentFigure"];
  if (action.documentId) {
    const group = await resolveDocumentFigureGroup(args.assignmentId || "", submissionId, args.userId,
      action.documentId, action.figureLabel, action.figureId);
    if (!group || !submissionId || !args.assignmentId) throw new Error("Document figure is unavailable for this attempt");
    documentFigure = {
      assignmentId: args.assignmentId, submissionId, documentId: action.documentId, versionPath: group.versionPath,
      documentTitle: group.document.title, label: group.label,
      figures: group.figures.map(({ id, pageNumber, description, caption, labels, panelLabel }) => ({ id, pageNumber, description, caption, labels, panelLabel })),
    };
  }

  const payload: DisplayContentActionPayload = {
    kind: "display_content",
    content: documentFigure ? stripPortableFigureImages(action.content) : action.content,
    title: action.title,
    ...(documentFigure ? { documentFigure } : {}),
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
