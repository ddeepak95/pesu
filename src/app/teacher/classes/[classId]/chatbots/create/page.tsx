import { guardContentTypeCreation } from "@/lib/settings/contentTypeGuard";
import { requireTeacherChatbotClass } from "@/lib/chatbots/pages";
import ChatbotEditor from "@/components/Chatbots/ChatbotEditor";

export const metadata = { title: "Create chatbot" };

export default async function Page({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  await guardContentTypeCreation(classId, "chatbot");
  const { classRow } = await requireTeacherChatbotClass(classId);
  return <ChatbotEditor classDbId={classRow.id} classId={classId} />;
}
