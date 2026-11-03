import { requireTeacherChatbot } from "@/lib/chatbots/pages";
import ChatbotEditor from "@/components/Chatbots/ChatbotEditor";

export const metadata = { title: "Edit chatbot" };

export default async function Page({ params }: { params: Promise<{ classId: string; chatbotId: string }> }) {
  const { classId, chatbotId } = await params;
  const bot = await requireTeacherChatbot(classId, chatbotId);
  return <ChatbotEditor classDbId={bot.class_id} classId={classId} bot={bot} />;
}
