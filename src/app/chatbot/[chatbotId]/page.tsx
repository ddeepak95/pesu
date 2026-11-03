import { getPublicChatbot } from "@/lib/chatbots/publicServer";
import { ChatbotAccessError } from "@/lib/chatbots/server";
import PublicChatbot from "@/components/Chatbots/PublicChatbot";

export async function generateMetadata({ params }: { params: Promise<{ chatbotId: string }> }) {
  try {
    const { bot } = await getPublicChatbot((await params).chatbotId);
    return { title: bot.title };
  } catch (error) {
    if (error instanceof ChatbotAccessError) return { title: "Chatbot" };
    throw error;
  }
}

export default async function PublicChatbotPage({ params }: { params: Promise<{ chatbotId: string }> }) {
  const { chatbotId } = await params;
  return <PublicChatbot shortId={chatbotId} />;
}
