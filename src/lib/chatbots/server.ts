import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getContentUnlockState } from "@/lib/dal";
import type { Chatbot } from "@/types/chatbot";

export class ChatbotAccessError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function requireStudentChatbot(shortId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new ChatbotAccessError("Sign in to use this chatbot", 401);
  const { data: bot, error } = await supabase.from("chatbots").select("*").eq("chatbot_id", shortId).eq("status", "active").maybeSingle();
  if (error) throw error;
  if (!bot) throw new ChatbotAccessError("Chatbot not found", 404);
  const { data: enrollment } = await supabase.from("class_students").select("student_id").eq("class_id", bot.class_id).eq("student_id", user.id).eq("status", "active").maybeSingle();
  if (!enrollment) throw new ChatbotAccessError("Student enrollment required", 403);
  const { data: membership } = await supabase.from("class_group_memberships").select("group_id").eq("class_id", bot.class_id).eq("student_id", user.id).maybeSingle();
  const { data: placement } = await supabase.from("content_items").select("id").eq("class_id", bot.class_id).eq("class_group_id", membership?.group_id ?? "00000000-0000-0000-0000-000000000000").eq("type", "chatbot").eq("ref_id", bot.id).eq("status", "active").maybeSingle();
  if (!placement) throw new ChatbotAccessError("Chatbot is not assigned to your group", 403);
  const { data: classRow } = await supabase.from("classes").select("class_id").eq("id", bot.class_id).eq("status", "active").single();
  if (!classRow) throw new ChatbotAccessError("Class unavailable", 404);
  const unlock = await getContentUnlockState(supabase, user.id, classRow.class_id, bot.id, "chatbot", placement.id);
  if (unlock.isLocked) throw new ChatbotAccessError(unlock.lockReason || "Chatbot locked", 403);
  return { supabase, user, bot: bot as Chatbot, classShortId: classRow.class_id as string, contentItemId: placement.id as string };
}

export async function requirePreviewChatbot(shortId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new ChatbotAccessError("Sign in to preview this chatbot", 401);
  const { data: bot, error } = await supabase.from("chatbots").select("*").eq("chatbot_id", shortId).in("status", ["active", "draft"]).maybeSingle();
  if (error) throw error;
  if (!bot) throw new ChatbotAccessError("Chatbot not found", 404);
  const { data: allowed, error: accessError } = await supabase.rpc("chatbot_teacher", { p_class_id: bot.class_id });
  if (accessError || !allowed) throw new ChatbotAccessError("Teacher access required", 403);
  return { supabase, user, bot: bot as Chatbot };
}
