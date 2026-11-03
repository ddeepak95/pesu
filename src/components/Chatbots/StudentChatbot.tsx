"use client";
import { useState } from "react";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import { markContentAsComplete } from "@/lib/queries/contentCompletions";
import { invalidateCompletionsCache } from "@/hooks/swr/useCompletions";
import type { Chatbot } from "@/types/chatbot";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import { RetryErrorCard } from "@/components/ui/retry-error-card";
import ChatbotChat from "./ChatbotChat";
export default function StudentChatbot({
  initialBot,
  classId,
  contentItemId,
  initialComplete,
}: {
  initialBot: Chatbot;
  classId: string;
  contentItemId: string;
  initialComplete: boolean;
}) {
  const router = useTrackedRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const back = `/student/classes/${classId}?tab=content`;
  async function finish() {
    setPending(true);
    setError(null);
    try {
      if (!initialComplete) {
        await markContentAsComplete(contentItemId);
        await invalidateCompletionsCache();
      }
      router.push(back);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark complete");
    } finally {
      setPending(false);
    }
  }
  return (
    <PageLayout variant="chat">
      <ChatbotChat
        initialBot={initialBot}
        backAction={<BackButton onClick={() => router.push(back)} />}
        onEndConversation={() => void finish()}
        ending={pending}
      />
      {error && (
        <div className="shrink-0 break-words">
          <RetryErrorCard message={error} variant="block" retryable={false} />
        </div>
      )}
    </PageLayout>
  );
}
