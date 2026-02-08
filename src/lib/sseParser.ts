/**
 * SSE (Server-Sent Events) stream parser for chat-assessment API.
 *
 * Parses a ReadableStream of SSE events and yields typed event objects.
 * Follows the standard SSE `data: {json}\n\n` format.
 *
 * Supported event types:
 * - text-delta: Incremental text content for the chat bubble
 * - end_conversation: LLM called the end_conversation tool (auto-end)
 * - done: Stream finished
 * - error: Server-side error
 */

export interface SSETextDeltaEvent {
  type: "text-delta";
  content: string;
}

export interface SSEEndConversationEvent {
  type: "end_conversation";
  reason: "thorough" | "refusal";
}

export interface SSEDoneEvent {
  type: "done";
}

export interface SSEErrorEvent {
  type: "error";
  error: string;
}

export type SSEEvent =
  | SSETextDeltaEvent
  | SSEEndConversationEvent
  | SSEDoneEvent
  | SSEErrorEvent;

/**
 * Parse an SSE stream from a ReadableStreamDefaultReader.
 * Yields typed SSEEvent objects as they arrive.
 *
 * Usage:
 * ```ts
 * const reader = response.body.getReader();
 * for await (const event of parseSSEStream(reader)) {
 *   switch (event.type) {
 *     case "text-delta":
 *       content += event.content;
 *       break;
 *     case "end_conversation":
 *       // handle auto-end
 *       break;
 *     case "done":
 *       break;
 *   }
 * }
 * ```
 */
export async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<SSEEvent> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by double newlines
    const parts = buffer.split("\n\n");
    // The last part may be incomplete, keep it in the buffer
    buffer = parts.pop() || "";

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // Find the data line (SSE format: "data: {json}")
      const lines = trimmed.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6); // Remove "data: " prefix
          try {
            const event = JSON.parse(jsonStr) as SSEEvent;
            yield event;
          } catch {
            console.warn("Failed to parse SSE event:", jsonStr);
          }
        }
      }
    }
  }

  // Process any remaining buffer content
  if (buffer.trim()) {
    const lines = buffer.trim().split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const jsonStr = line.slice(6);
        try {
          const event = JSON.parse(jsonStr) as SSEEvent;
          yield event;
        } catch {
          console.warn("Failed to parse final SSE event:", jsonStr);
        }
      }
    }
  }
}
