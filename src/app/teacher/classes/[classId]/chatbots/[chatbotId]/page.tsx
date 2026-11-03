import { cache } from "react";
import { requireTeacherChatbot } from "@/lib/chatbots/pages";
import TeacherChatbot from "@/components/Chatbots/TeacherChatbot";

const getTeacherChatbot = cache(requireTeacherChatbot);

export async function generateMetadata({ params }: { params: Promise<{ classId: string; chatbotId: string }> }) {
  const { classId, chatbotId } = await params;
  const bot = await getTeacherChatbot(classId, chatbotId);
  return { title: bot.title };
}

export default async function Page({ params }: { params: Promise<{ classId: string; chatbotId: string }> }) {
  const { classId, chatbotId } = await params;
  const bot = await getTeacherChatbot(classId, chatbotId);
  return <TeacherChatbot bot={bot} classId={classId} />;
}
