/**
 * Chat streaming adapter.
 *
 * Wraps streamText + the end_conversation tool and emits the same SSE event
 * payloads that ChatInputArea.tsx consumes (see src/lib/sseParser.ts):
 *
 *   { type: "text-delta", content: string }
 *   { type: "end_conversation", reason: "refusal" | "thorough" }
 *   { type: "done" }
 *   { type: "error", error: string }
 */

import { streamText, tool, jsonSchema, stepCountIs } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { withRetry } from "./retry";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatStreamCallbacks {
  /** Called for each text chunk as it arrives. */
  onTextDelta: (chunk: string) => void;
  /** Called when the LLM invokes end_conversation. */
  onEndConversation: (reason: "refusal" | "thorough", message: string) => void;
  /** Called once the stream is complete (after all events). */
  onDone: () => void;
  /** Called on unrecoverable error. */
  onError: (message: string) => void;
}

// JSON Schema for the end_conversation tool parameters
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
        "Use 'refusal' if the student explicitly refuses to answer. Use 'thorough' if the student has thoroughly answered the question.",
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

export const END_CONVERSATION_TOOL_DESCRIPTION =
  "End the conversation gracefully. Call this when: (1) the student explicitly refuses to answer (e.g., says 'I refuse', 'I don't want to', 'I can't answer'), or (2) the student has answered the question and you're satisfied with their response covering the expected answers. Always provide a polite ending message thanking the student.";

/**
 * Run the chat stream and invoke callbacks for each event type.
 * Wraps the underlying streamText call with retry on retryable errors.
 */
export async function runChatStream(options: {
  model: LanguageModelV3;
  systemPrompt: string;
  greeting?: string;
  messages: ChatMessage[];
  callbacks: ChatStreamCallbacks;
}): Promise<void> {
  const { model, systemPrompt, greeting, messages, callbacks } = options;

  // Build the messages array for the AI SDK
  const sdkMessages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [{ role: "system", content: systemPrompt }];

  if (greeting && messages.length === 0) {
    sdkMessages.push({
      role: "system",
      content: `[Instructions for your first response]: ${greeting}`,
    });
  }

  for (const msg of messages) {
    sdkMessages.push({ role: msg.role, content: msg.content });
  }

  try {
    const result = await withRetry(() =>
      Promise.resolve(
        streamText({
          model,
          messages: sdkMessages,
          tools: {
            end_conversation: tool({
              description: END_CONVERSATION_TOOL_DESCRIPTION,
              inputSchema: endConversationInputSchema,
            }),
          },
          toolChoice: "auto",
          stopWhen: stepCountIs(2), // allow one tool-call step
        }),
      ),
    );

    let endConversationCalled = false;

    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        callbacks.onTextDelta(part.text);
      } else if (part.type === "tool-call") {
        if (part.toolName === "end_conversation") {
          endConversationCalled = true;
          const input = part.input as { reason?: string; message?: string };
          const reason =
            input.reason === "refusal" ? "refusal" : ("thorough" as const);
          const message = input.message ?? "";

          if (message) {
            callbacks.onTextDelta(message);
          }
          callbacks.onEndConversation(reason, message);
        }
      } else if (part.type === "error") {
        callbacks.onError(
          part.error instanceof Error
            ? part.error.message
            : "Unknown streaming error",
        );
        return;
      }
    }

    // Emit done unless we already handled end_conversation (which implies done)
    if (!endConversationCalled) {
      callbacks.onDone();
    } else {
      callbacks.onDone();
    }
  } catch (err) {
    callbacks.onError(
      err instanceof Error ? err.message : "Unknown streaming error",
    );
  }
}
