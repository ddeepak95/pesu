/** Consume framed deltas, including UTF-8 and JSON split across network chunks. */
export async function readChatbotStream(
  response: Response,
  onText: (text: string) => void,
): Promise<void> {
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Chatbot request failed");
  }
  if (!response.body) throw new Error("No response stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "",
    complete = false;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "delta") onText(event.text);
    else if (event.type === "error")
      throw new Error(event.error || "Reply failed");
    else if (event.type === "done") complete = true;
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(consume);
      if (done) break;
    }
    consume(buffer);
    if (!complete)
      throw new Error(
        "The connection was interrupted. Refresh the conversation before retrying.",
      );
  } finally {
    reader.releaseLock();
  }
}
export async function streamChatbotTurn(
  shortId: string,
  body: unknown,
  onText: (text: string) => void,
): Promise<void> {
  const response = await fetch(
    `/api/chatbots/${encodeURIComponent(shortId)}/turn`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  await readChatbotStream(response, onText);
}
