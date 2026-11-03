import { cache } from "react";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { requireStudentChatbot, ChatbotAccessError } from "@/lib/chatbots/server";
import StudentChatbot from "@/components/Chatbots/StudentChatbot";
import { ContentLockedView } from "@/components/Shared/ContentLockedView";

const getStudentChatbot = cache(async (chatbotId: string) => {
  await verifySession("/student/login");
  return requireStudentChatbot(chatbotId);
});

export async function generateMetadata({ params }: { params: Promise<{ classId: string; chatbotId: string }> }) {
  const { classId, chatbotId } = await params;
  try {
    const access = await getStudentChatbot(chatbotId);
    return { title: access.classShortId === classId ? access.bot.title : "Chatbot" };
  } catch (error) {
    if (error instanceof ChatbotAccessError) return { title: "Chatbot" };
    throw error;
  }
}

export default async function Page({ params }: { params: Promise<{ classId: string; chatbotId: string }> }) {
  const { classId, chatbotId } = await params;
  let access;
  try {
    access = await getStudentChatbot(chatbotId);
  } catch (error) {
    if (error instanceof ChatbotAccessError && error.status === 403) {
      return <ContentLockedView lockReason={error.message} classHref={`/student/classes/${classId}`} backHref={`/student/classes/${classId}`} backLabel="Go to class" />;
    }
    if (error instanceof ChatbotAccessError && error.status === 404) notFound();
    throw error;
  }
  if (access.classShortId !== classId) notFound();
  const { data: completion } = await access.supabase.from("student_content_completions").select("id").eq("content_item_id", access.contentItemId).eq("student_id", access.user.id).maybeSingle();
  return <StudentChatbot initialBot={access.bot} classId={classId} contentItemId={access.contentItemId} initialComplete={!!completion} />;
}
