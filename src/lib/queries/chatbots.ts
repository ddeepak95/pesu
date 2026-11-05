import { createClient } from "@/lib/supabase";
import { validateChatbotConfig } from "@/lib/chatbots/config";
import type { Chatbot, ChatbotConfig, ChatbotConversation, ChatbotMessage } from "@/types/chatbot";
import type { ContentItem } from "@/types/contentItem";

export async function getChatbotsByIds(ids: string[]): Promise<Chatbot[]> {
  if (!ids.length) return [];
  const { data, error } = await createClient().from("chatbots").select("*").in("id", ids).in("status", ["active", "draft"]);
  if (error) throw error;
  return data ?? [];
}

export async function getChatbot(shortId: string): Promise<Chatbot | null> {
  const { data, error } = await createClient().from("chatbots").select("*").eq("chatbot_id", shortId).in("status", ["active", "draft"]).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getChatbotConversations(id: string, preview = false): Promise<ChatbotConversation[]> {
  const query = createClient().from("chatbot_conversations").select("*").eq("chatbot_id", id).eq("is_preview", preview).order("created_at", { ascending: false }).order("id");
  const rows: ChatbotConversation[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

export async function getChatbotMessages(conversationId: string): Promise<ChatbotMessage[]> {
  const query = createClient().from("chatbot_messages").select("*").eq("conversation_id", conversationId).order("created_at").order("id");
  const rows: ChatbotMessage[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

export async function createChatbot(payload: ChatbotConfig & { class_id: string; class_group_id: string | null; image_source_id?: string; placement?: Partial<ContentItem> }): Promise<Chatbot> {
  const { data, error } = await createClient().rpc("save_chatbot", {
    p_class_id: payload.class_id, p_group_id: payload.class_group_id,
    p_config: validateChatbotConfig(payload), p_placement: { ...payload.placement, image_source_id: payload.image_source_id },
  }).single();
  if (error) throw error;
  return data as Chatbot;
}

export async function updateChatbot(bot: Chatbot, config: ChatbotConfig): Promise<Chatbot> {
  const { data, error } = await createClient().rpc("save_chatbot", {
    p_class_id: bot.class_id, p_group_id: null, p_id: bot.id, p_config: validateChatbotConfig(config),
  }).single();
  if (error) throw error;
  return data as Chatbot;
}

export async function deleteChatbot(id: string): Promise<void> {
  const { error } = await createClient().rpc("delete_chatbot", { p_id: id });
  if (error) throw error;
}

export async function postChatbotAction(shortId: string, action: "conversation" | "turn" | "public", body: unknown): Promise<void> {
  const response = await fetch(`/api/chatbots/${encodeURIComponent(shortId)}/${action}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Chatbot request failed");
}

export interface PublicChatbotSession {
  bot: Chatbot;
  participant: { id: string; name: string } | null;
}

export async function getPublicChatbotData<T>(shortId: string, params = ""): Promise<T> {
  const response = await fetch(`/api/chatbots/${encodeURIComponent(shortId)}/public${params}`, { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Public chatbot unavailable");
  return result as T;
}

export async function getChatbotPublicParticipants(botId: string): Promise<Array<{ id: string; name: string }>> {
  const rows: Array<{ id: string; name: string }> = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await createClient().from("chatbot_public_participants").select("id,name")
      .eq("chatbot_id", botId).order("id").range(offset, offset + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
