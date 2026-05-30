/**
 * MCQ action handler.
 *
 * Generates a four-choice multiple choice question for the requested topic,
 * persists it to chat_message_actions (before streaming, so it survives a
 * client disconnect), then emits the action_payload SSE event.
 */

import { generateObject } from "ai";
import { z } from "zod";

import {
  fetchLatestMcqPayload,
  insertChatMessageAction,
} from "@/lib/queries/chatMessageActions";
import type { McqActionPayload } from "./types";
import type { DispatchActionArgs } from "./dispatcher";
import type { ActionInput } from "./schema";

const mcqResultSchema = z.object({
  question: z.string(),
  choices: z.array(z.string()).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string(),
});

type McqAction = Extract<ActionInput, { kind: "mcq" }>;

export async function handleMcqAction(
  args: DispatchActionArgs & { action: McqAction },
): Promise<void> {
  const {
    id,
    action,
    model,
    providerOptions,
    enqueue,
    supabase,
    submissionId,
    chatMessageId,
    languageLabel,
  } = args;

  // Retry: re-present the exact same question the learner just attempted.
  let payload: McqActionPayload | null = action.repeatPrevious
    ? await fetchLatestMcqPayload(supabase, submissionId)
    : null;

  if (!payload) {
    const { object } = await generateObject({
      model,
      providerOptions,
      schema: mcqResultSchema,
      system:
        "You write a single high-quality multiple choice question for a tutoring " +
        "session. Exactly four choices, one correct. The explanation justifies the " +
        "correct answer briefly. Match the difficulty requested. The question, " +
        "choices, and explanation are rendered as GitHub-flavored Markdown — you may " +
        "use **bold**, *italics*, `inline code`, and fenced code blocks where they " +
        "make the content clearer. Use Unicode for simple scientific notation (e.g. " +
        "O₂, H₂O, x²). Keep each choice concise.",
      prompt:
        `Topic: ${action.topic}\n` +
        `Difficulty: ${action.difficulty}\n` +
        `Write the question, all four choices, and the explanation in ${languageLabel} ` +
        `to match the conversation language.`,
    });
    payload = { kind: "mcq", ...object };
  }

  // Persist before streaming — survives a mid-stream client disconnect.
  await insertChatMessageAction(supabase, {
    id,
    chatMessageId,
    submissionId,
    kind: "mcq",
    payload,
  });

  enqueue({ type: "action_payload", id, kind: "mcq", data: payload });
}
