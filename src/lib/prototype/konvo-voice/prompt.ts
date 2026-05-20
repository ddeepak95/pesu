import { KONVO_INIT_USER_NUDGE } from "./promptAppendix";

export function buildTurnMessages(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  options: {
    init?: boolean;
    systemPrompt: string;
    greeting?: string;
  },
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> =
    [{ role: "system", content: options.systemPrompt }];

  for (const msg of history) {
    messages.push({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    });
  }

  if (options.init) {
    const initContent = options.greeting?.trim()
      ? `${KONVO_INIT_USER_NUDGE}\n\nUse this greeting (adapt naturally): ${options.greeting.trim()}`
      : KONVO_INIT_USER_NUDGE;
    messages.push({ role: "user", content: initContent });
  }

  return messages;
}

export function segmentsToAssistantText(
  segments: import("./schema").BotSegment[],
): string {
  return segments
    .filter((s): s is { type: "speech"; text: string } =>
      s.type === "speech" && Boolean(s.text?.trim()),
    )
    .map((s) => s.text.trim())
    .join("\n\n");
}
