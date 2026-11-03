import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase-server";
import { ChatbotAccessError } from "./server";
import type { Chatbot } from "@/types/chatbot";

export const publicChatbotCookie = (id: string) => `chatbot-public-${id}`;
export const hashPublicChatbotToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function getPublicChatbot(shortId: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.from("chatbots").select("*")
    .eq("chatbot_id", shortId).eq("is_public", true).eq("status", "active").maybeSingle();
  if (error) throw error;
  if (!data) throw new ChatbotAccessError("Public chatbot unavailable", 404);
  const { data: classRow, error: classError } = await supabase.from("classes").select("id").eq("id", data.class_id).eq("status", "active").maybeSingle();
  if (classError) throw classError;
  if (!classRow) throw new ChatbotAccessError("Public chatbot unavailable", 404);
  return { supabase, bot: data as Chatbot };
}

export async function getPublicChatbotParticipant(botId: string) {
  const token = (await cookies()).get(publicChatbotCookie(botId))?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const { data, error } = await createServiceRoleClient().from("chatbot_public_participants")
    .select("id,name").eq("chatbot_id", botId).eq("token_hash", hashPublicChatbotToken(token)).maybeSingle();
  if (error) throw error;
  return data as { id: string; name: string } | null;
}

export async function createPublicChatbotParticipant(botId: string, name: string) {
  const token = randomBytes(32).toString("hex");
  const { error } = await createServiceRoleClient().from("chatbot_public_participants")
    .insert({ chatbot_id: botId, name, token_hash: hashPublicChatbotToken(token) });
  if (error) throw error;
  (await cookies()).set(publicChatbotCookie(botId), token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: `/api/chatbots/`, maxAge: 60 * 60 * 24 * 365,
  });
}

export async function requirePublicChatbot(shortId: string) {
  const access = await getPublicChatbot(shortId);
  const participant = await getPublicChatbotParticipant(access.bot.id);
  if (!participant) throw new ChatbotAccessError("Enter your name to begin this public chatbot", 401);
  return { ...access, actorId: participant.id, userId: null, ownerColumn: "public_participant_id" as const };
}

export async function logoutPublicChatbot(botId: string) {
  const participant = await getPublicChatbotParticipant(botId);
  if (participant) {
    // Revoke the old credential while retaining the respondent and transcripts.
    const { error } = await createServiceRoleClient().from("chatbot_public_participants")
      .update({ token_hash: hashPublicChatbotToken(randomBytes(32).toString("hex")) })
      .eq("id", participant.id).eq("chatbot_id", botId);
    if (error) throw error;
  }
  (await cookies()).set(publicChatbotCookie(botId), "", {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/api/chatbots/", maxAge: 0,
  });
}
