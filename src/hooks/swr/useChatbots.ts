import useSWR, { mutate } from "swr";
import { getPublicChatbotData, getChatbotPublicParticipants, type PublicChatbotSession } from "@/lib/queries/chatbots";
import type { ChatbotConversation, ChatbotMessage } from "@/types/chatbot";
import { getChatbot, getChatbotsByIds, getChatbotConversations, getChatbotMessages } from "@/lib/queries/chatbots";

export function useChatbotsByIds(ids: string[]) {
  const key = [...ids].sort().join(",");
  return useSWR(key ? ["chatbotsByIds", key] : null, () => getChatbotsByIds(ids));
}

export function useChatbot(shortId: string | null) {
  return useSWR(shortId ? ["chatbot", shortId] : null, () => getChatbot(shortId!));
}

export function useChatbotConversations(id: string | null, preview = false, publicShortId?: string) {
  return useSWR(id ? ["chatbotConversations", id, preview, publicShortId ?? "class"] : null, () => publicShortId ? getPublicChatbotData<ChatbotConversation[]>(publicShortId, "?view=conversations") : getChatbotConversations(id!, preview), {
    refreshInterval: data => data?.some(c => c.pending_message_id) ? 5000 : 0,
  });
}

export function useChatbotMessages(id: string | null, publicShortId?: string) {
  return useSWR(id ? ["chatbotMessages", id, publicShortId ?? "class"] : null, () => publicShortId ? getPublicChatbotData<ChatbotMessage[]>(publicShortId, `?view=messages&conversationId=${encodeURIComponent(id!)}`) : getChatbotMessages(id!), {
    refreshInterval: data => data?.some(m => m.status === "pending") ? 5000 : 0,
  });
}

export function usePublicChatbotSession(shortId: string | null) {
  return useSWR(shortId ? ["chatbotPublicSession", shortId] : null, () => getPublicChatbotData<PublicChatbotSession>(shortId!));
}

export function useChatbotPublicParticipants(botId: string) {
  return useSWR(["chatbotPublicParticipants", botId], () => getChatbotPublicParticipants(botId));
}

export function invalidateChatbots() {
  return mutate(key => Array.isArray(key) && typeof key[0] === "string" && key[0].startsWith("chatbot"));
}

export function clearPublicChatbotCache(shortId: string) {
  return mutate(key => Array.isArray(key) &&
    ((key[0] === "chatbotConversations" && key[3] === shortId) ||
     (key[0] === "chatbotMessages" && key[2] === shortId)),
    undefined, { revalidate: false });
}
