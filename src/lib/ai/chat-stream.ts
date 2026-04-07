/**
 * Chat streaming helpers.
 *
 * Exports the end_conversation tool definition and a thin helper that calls
 * streamText and returns the fullStream result. The route handler is
 * responsible for iterating the stream and writing SSE events.
 */

import { streamText, tool, jsonSchema, stepCountIs } from "ai";
import type { LanguageModelV3, SharedV3ProviderOptions } from "@ai-sdk/provider";

// ── end_conversation tool ────────────────────────────────────────────────────

const endConversationInputSchema = jsonSchema<{
  reason: "refusal" | "thorough";
  message: string;
}>({
  type: "object",
  properties: {
    reason: {
      type: "string",
      enum: ["refusal", "thorough"],
      description:
        "Use 'refusal' if the student explicitly refuses to answer. " +
        "Use 'thorough' if the student has thoroughly answered the question.",
    },
    message: {
      type: "string",
      description:
        "A polite ending message in the conversation language, thanking the student.",
    },
  },
  required: ["reason", "message"],
  additionalProperties: false,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);

const END_CONVERSATION_TOOL_DESCRIPTION =
  "End the conversation gracefully. Call this when: (1) the student explicitly " +
  "refuses to answer (e.g., says 'I refuse', 'I don't want to', 'I can't answer'), " +
  "or (2) the student has answered the question and you're satisfied with their " +
  "response covering the expected answers. Always provide a polite ending message " +
  "thanking the student.";

// ── Public helper ────────────────────────────────────────────────────────────

export interface ChatStreamOptions {
  model: LanguageModelV3;
  systemPrompt: string;
  greeting?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  providerOptions?: SharedV3ProviderOptions;
}

/**
 * Start a chat stream. Returns the streamText result whose `.fullStream`
 * the caller iterates to emit SSE events.
 */
export function createChatStream(options: ChatStreamOptions) {
  const { model, systemPrompt, greeting, messages, providerOptions } = options;

  let system = systemPrompt;
  if (greeting && messages.length === 0) {
    system += `\n\n[Instructions for your first response]: ${greeting}`;
  }

  // Gemini requires at least one user message in contents.
  const sdkMessages =
    messages.length > 0
      ? messages
      : [{ role: "user" as const, content: "Begin." }];

  return streamText({
    model,
    system,
    messages: sdkMessages,
    tools: {
      end_conversation: tool({
        description: END_CONVERSATION_TOOL_DESCRIPTION,
        inputSchema: endConversationInputSchema,
      }),
    },
    toolChoice: "auto",
    stopWhen: stepCountIs(2),
    providerOptions,
    onError({ error }) {
      console.error("[chat-stream] streamText error:", error);
    },
  });
}
