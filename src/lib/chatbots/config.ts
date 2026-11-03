import { isKnownLocale, getLocaleLabel } from "@/lib/locales";
import type { ChatbotConfig, ChatbotConversation } from "@/types/chatbot";

export const DEFAULT_CHATBOT_PROMPT =
  "You are an expert teacher. You are teaching the topic \"{topic_title}\" in the language {language}. Follow the best practices of conversational learning to help the student learn.";

export const DEFAULT_CHATBOT_CONFIG: ChatbotConfig = {
  is_public: false,
  title: "",
  language: "en",
  lock_language: true,
  system_prompt: DEFAULT_CHATBOT_PROMPT,
  turn_limit: 20,
  max_conversations: 1,
  web_search: false,
  image_search: false,
  status: "draft",
};

export function validateChatbotConfig(input: unknown): ChatbotConfig {
  if (!input || typeof input !== "object")
    throw new Error("Invalid chatbot configuration");
  const v = input as Record<string, unknown>;
  for (const [key, max] of [
    ["title", 200],
    ["system_prompt", 20000],
  ] as const) {
    if (typeof v[key] !== "string" || !v[key].trim() || v[key].length > max) {
      throw new Error(
        `${key.replaceAll("_", " ")} is required (maximum ${max} characters)`,
      );
    }
  }
  if (typeof v.language !== "string" || !isKnownLocale(v.language))
    throw new Error("Choose a supported language");
  if (
    !Number.isInteger(v.turn_limit) ||
    Number(v.turn_limit) < 1 ||
    Number(v.turn_limit) > 1000
  )
    throw new Error("Turn limit must be between 1 and 1000");
  if (
    v.max_conversations !== null &&
    (!Number.isInteger(v.max_conversations) ||
      Number(v.max_conversations) < 1 ||
      Number(v.max_conversations) > 1001)
  )
    throw new Error("Conversations must be between 1 and 1001, or unlimited");
  if (typeof v.web_search !== "boolean" || typeof v.image_search !== "boolean")
    throw new Error("Invalid search settings");
  if (v.status !== "active" && v.status !== "draft")
    throw new Error("Invalid status");
  return {
    is_public: v.is_public === true,
    title: String(v.title).trim(),
    language: v.language,
    lock_language: v.lock_language !== false,
    system_prompt: String(v.system_prompt).trim(),
    turn_limit: Number(v.turn_limit),
    max_conversations:
      v.max_conversations === null ? null : Number(v.max_conversations),
    web_search: v.web_search,
    image_search: v.image_search,
    status: v.status,
  };
}

export function buildChatbotPrompt(
  config: Pick<
    ChatbotConfig,
    "system_prompt" | "title" | "language" | "image_search" | "web_search"
  >,
): string {
  const prompt = config.system_prompt.replace(
    /\{(topic_title|language)\}/g,
    (_, key: string) =>
      key === "topic_title" ? config.title : getLocaleLabel(config.language),
  );
  return config.image_search
    ? `${prompt}\n\nAdd relevant images to explain the concept. Return only publicly accessible image URLs that can be loaded directly without signing in. Do not include broken or inaccessible image links.`
    : prompt;
}

export function chatbotAllowance(
  config: Pick<ChatbotConfig, "turn_limit" | "max_conversations">,
  conversations: ChatbotConversation[],
) {
  const latest = conversations.reduce<ChatbotConversation | null>(
    (a, b) => (!a || b.sequence > a.sequence ? b : a),
    null,
  );
  const conversationsUsed = latest?.sequence ?? 0;
  return {
    latest,
    turnsRemaining: Math.max(0, config.turn_limit - (latest?.turns_used ?? 0)),
    additionalConversationsRemaining:
      config.max_conversations === null
        ? null
        : Math.max(0, config.max_conversations - conversationsUsed),
    canRestart:
      !!latest &&
      (config.max_conversations === null ||
        conversationsUsed < config.max_conversations),
  };
}

export function chatbotConversationLanguage(
  config: Pick<ChatbotConfig, "language" | "lock_language">,
  preferred: string | null,
): string {
  return !config.lock_language && preferred && isKnownLocale(preferred)
    ? preferred
    : config.language;
}
