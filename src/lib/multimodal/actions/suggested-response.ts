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

import { generateObject } from "ai";
import { z } from "zod";

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
    model,
    providerOptions,
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

  let systemPrompt: string;
  let userPrompt: string;

  if (action.triggerKind === "express") {
    // Learner asked "how do I say X?" — express that phrase in the target language.
    systemPrompt =
      `You are a language learning coach. ` +
      `Given a phrase or idea in any language, write how to express it naturally as a short spoken phrase in ${languageLabel}. ` +
      `Write in the native script of ${languageLabel} (never romanize unless it uses the Latin alphabet). ` +
      `One short spoken phrase only.` +
      supportClause;
    userPrompt =
      `Express this in ${languageLabel}: "${action.botUtterance.trim()}"`;
  } else {
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
    systemPrompt =
      `You are a language learning coach helping a student practice ${languageLabel}. ` +
      `When given a tutor's utterance, write a SHORT spoken reply the STUDENT would say — ` +
      `directly responding to or answering what the tutor said. ` +
      `Write in the native script of ${languageLabel} (never romanize unless it uses the Latin alphabet). ` +
      `One short spoken phrase only.` +
      supportClause;
    userPrompt =
      contextSection +
      `The tutor just said: "${action.botUtterance.trim()}"\n` +
      `Write the student's direct reply in ${languageLabel}.`;
  }

  const { object } = await generateObject({
    model,
    providerOptions,
    schema: suggestedResponseResultSchema,
    system: systemPrompt,
    prompt: userPrompt,
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
