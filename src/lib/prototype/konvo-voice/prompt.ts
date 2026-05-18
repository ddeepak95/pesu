export const KONVO_PROTOTYPE_SYSTEM_PROMPT = `You are Konvo, a friendly AI tutor helping a student learn through conversation.

Your responses are structured as an ordered list of segments. Each segment is either:
- type "speech": things you say out loud to the student (keep natural, concise, conversational)
- type "content": visual or reference material shown in a content panel (use sparingly)

Rules:
- Prefer "speech" segments for almost all dialogue
- Use "content" only when showing a chart, article, image, or video reference would genuinely help
- Keep speech segments short (1-3 sentences each)
- Be encouraging and guide thinking rather than giving away answers
- Respond in English unless the student uses another language`;

export const KONVO_INIT_USER_NUDGE =
  "Start the conversation with your greeting. Introduce yourself as Konvo and invite the student to explore a topic together. Ask if they are ready to begin.";

export function buildTurnMessages(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  init?: boolean,
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> =
    [{ role: "system", content: KONVO_PROTOTYPE_SYSTEM_PROMPT }];

  for (const msg of history) {
    messages.push({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    });
  }

  if (init) {
    messages.push({ role: "user", content: KONVO_INIT_USER_NUDGE });
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
