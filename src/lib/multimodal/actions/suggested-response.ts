/**
 * Suggested-response action handler.
 *
 * Generates a short, natural spoken response the learner can say in reply to
 * the bot's last utterance, in the primary language (native script). When a
 * support language is configured, also generates a romanized transliteration
 * and a translation into that language.
 *
 * Persists to chat_message_actions before streaming (survives a client
 * disconnect), then emits the action_payload SSE event.
 */

import { z } from "zod";

import { SPEECH_SCRIPT_DIRECTIVE } from "@/lib/ai/multimodal-directives";
import { insertChatMessageAction } from "@/lib/queries/chatMessageActions";
import type { SuggestedResponseActionPayload } from "./types";
import type { DispatchActionArgs } from "./dispatcher";
import type { ActionInput } from "./schema";

const suggestedResponseResultSchema = z.object({
  responseText: z
    .string()
    .describe(
      "The student's direct reply to the tutor's message — written in the target language's native script. This is what the learner would SAY in response, answering or reacting to what the tutor said.",
    ),
  transliteration: z
    .string()
    .optional()
    .describe(
      "Romanized transliteration of responseText. Omit if the primary language uses the Latin alphabet.",
    ),
  translation: z
    .string()
    .optional()
    .describe("Translation of responseText into the support language, if one is provided."),
});

type SuggestedResponseAction = Extract<ActionInput, { kind: "suggested_response" }>;

export async function handleSuggestedResponseAction(
  args: DispatchActionArgs & { action: SuggestedResponseAction },
): Promise<void> {
  const {
    id,
    action,
    handle,
    enqueue,
    supabase,
    submissionId,
    chatMessageId,
    languageLabel,
    supportLanguageLabel,
    recentMessages,
  } = args;

  const supportClause = supportLanguageLabel
    ? ` Also provide a romanized transliteration (omit if the script is already Latin) and a translation into ${supportLanguageLabel}.`
    : " Omit transliteration and translation.";

  // Bulb trigger — generate a reply the student can say to the tutor's last utterance.
  // Recent context gives topic awareness without pattern-matching prior student questions.
  const contextSection =
    recentMessages && recentMessages.length > 0
      ? "Recent conversation context:\n" +
        recentMessages
          .map((m) => `${m.role === "assistant" ? "Tutor" : "Student"}: ${m.content.trim()}`)
          .join("\n") +
        "\n\n"
      : "";
  const systemPrompt =
    `You are a teacher helping a student practice ${languageLabel}. ` +
    `When given a tutor's utterance, write a SHORT spoken reply the STUDENT would say — ` +
    `directly responding to or answering what the tutor said. ` +
    `One short spoken phrase only. ` +
    SPEECH_SCRIPT_DIRECTIVE +
    supportClause;
  const userPrompt =
    contextSection +
    `The tutor just said: "${action.botUtterance.trim()}"\n` +
    `Write the student's direct reply in ${languageLabel}.`;

  // maxRetries: 1 — dispatchAction already wraps this whole handler in its
  // own withRetry(INTERACTIVE_MAX_ATTEMPTS) (§5.3).
  const object = await handle.generateStructured({
    schema: suggestedResponseResultSchema,
    schemaName: "suggestedResponseResultSchema",
    maxRetries: 1,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const payload: SuggestedResponseActionPayload = {
    kind: "suggested_response",
    responseText: object.responseText,
    ...(object.transliteration ? { transliteration: object.transliteration } : {}),
    ...(object.translation ? { translation: object.translation } : {}),
  };

  await insertChatMessageAction(supabase, {
    id,
    chatMessageId,
    submissionId,
    kind: "suggested_response",
    payload,
  });

  enqueue({ type: "action_payload", id, kind: "suggested_response", data: payload });
}
