import type { ChatbotMessage } from "@/types/chatbot";
import type { ChatDisplayMessage } from "@/components/Shared/KonvoVoice/ContentBox";
export function chatbotDisplayMessage(
  message: ChatbotMessage,
): ChatDisplayMessage {
  return {
    id: message.id,
    role: message.role === "user" ? "student" : "assistant",
    content: message.content,
    typed: true,
    format: "markdown",
    deliveryStatus: message.status,
    sources: message.sources,
    imageMappings: message.image_mappings,
  };
}
