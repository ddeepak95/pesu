import "server-only";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/dal";
import type { Chatbot } from "@/types/chatbot";

export async function requireTeacherChatbotClass(classId: string) {
  const { supabase } = await verifySession("/teacher/login");
  const { data: classRow } = await supabase.from("classes").select("id, class_id").eq("class_id", classId).eq("status", "active").maybeSingle();
  if (!classRow) notFound();
  const { data: authorized, error } = await supabase.rpc("chatbot_teacher", { p_class_id: classRow.id });
  if (error || !authorized) notFound();
  return { supabase, classRow };
}

export async function requireTeacherChatbot(classId: string, chatbotId: string) {
  const { supabase, classRow } = await requireTeacherChatbotClass(classId);
  const { data: bot } = await supabase.from("chatbots").select("*").eq("class_id", classRow.id).eq("chatbot_id", chatbotId).in("status", ["active", "draft"]).maybeSingle();
  if (!bot) notFound();
  return bot as Chatbot;
}
