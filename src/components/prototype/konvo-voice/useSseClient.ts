"use client";

export type SseHandler = (event: Record<string, unknown>) => void;

export async function consumeSse(
  response: Response,
  onEvent: SseHandler,
  signal?: AbortSignal,
): Promise<void> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  const dispatchBufferedEvents = (chunk: string) => {
    buffer += chunk;
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part
        .split("\n")
        .find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        const json = JSON.parse(line.slice(6)) as Record<string, unknown>;
        onEvent(json);
      } catch {
        // skip malformed chunks
      }
    }
  };

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        break;
      }

      const { done, value } = await reader.read();
      if (value) {
        dispatchBufferedEvents(decoder.decode(value, { stream: true }));
      }
      if (done) break;
    }

    const tail = decoder.decode();
    if (tail) {
      dispatchBufferedEvents(tail);
    }
    if (buffer.trim()) {
      dispatchBufferedEvents("\n\n");
    }
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      throw err;
    }
  }
}

export async function postJsonSse(
  url: string,
  body: unknown,
  onEvent: SseHandler,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  await consumeSse(response, onEvent, signal);
}

export async function postFormSse(
  url: string,
  formData: FormData,
  onEvent: SseHandler,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    body: formData,
    signal,
  });
  await consumeSse(response, onEvent, signal);
}
