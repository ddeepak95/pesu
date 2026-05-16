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

const endConversationJsonSchema = {
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
} as const;

const endConversationInputSchema = jsonSchema<{
  reason: "refusal" | "thorough";
  message: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}>(endConversationJsonSchema as any);

const END_CONVERSATION_TOOL_DESCRIPTION =
  "End the conversation gracefully. Call this when: (1) the student explicitly " +
  "refuses to answer (e.g., says 'I refuse', 'I don't want to', 'I can't answer'), " +
  "or (2) the student has answered the question and you're satisfied with their " +
  "response covering the expected answers. Always provide a polite ending message " +
  "thanking the student.";

/** Serializable tool spec for AI invocation logs. */
export const CHAT_END_CONVERSATION_TOOL_LOG = {
  end_conversation: {
    description: END_CONVERSATION_TOOL_DESCRIPTION,
    inputSchema: endConversationJsonSchema,
  },
} as const;

export interface ChatStreamOptions {
  model: LanguageModelV3;
  systemPrompt: string;
  greeting?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  providerOptions?: SharedV3ProviderOptions;
}

/** Exact arguments passed to streamText (for audit logging). */
export interface ResolvedChatStreamCall {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  tools: typeof CHAT_END_CONVERSATION_TOOL_LOG;
  toolChoice: "auto";
  stopWhen: "stepCountIs(2)";
  providerOptions?: SharedV3ProviderOptions;
}

export function resolveChatStreamCall(
  options: Omit<ChatStreamOptions, "model">,
): ResolvedChatStreamCall {
  const { systemPrompt, greeting, messages, providerOptions } = options;

  let system = systemPrompt;
  if (greeting && messages.length === 0) {
    system += `\n\n[Instructions for your first response]: ${greeting}`;
  }

  const sdkMessages =
    messages.length > 0
      ? messages
      : [{ role: "user" as const, content: "Begin." }];

  return {
    system,
    messages: sdkMessages,
    tools: CHAT_END_CONVERSATION_TOOL_LOG,
    toolChoice: "auto",
    stopWhen: "stepCountIs(2)",
    providerOptions,
  };
}

function chatStreamTools() {
  return {
    end_conversation: tool({
      description: END_CONVERSATION_TOOL_DESCRIPTION,
      inputSchema: endConversationInputSchema,
    }),
  };
}

/**
 * Start a chat stream. Returns the streamText result whose `.fullStream`
 * the caller iterates to emit SSE events.
 */
export function createChatStream(options: ChatStreamOptions) {
  const { model, ...rest } = options;
  const call = resolveChatStreamCall(rest);

  return streamText({
    model,
    system: call.system,
    messages: call.messages,
    tools: chatStreamTools(),
    toolChoice: call.toolChoice,
    stopWhen: stepCountIs(2),
    providerOptions: call.providerOptions,
    onError({ error }) {
      console.error("[chat-stream] streamText error:", error);
    },
  });
}
