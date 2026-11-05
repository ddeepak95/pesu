"use client";
import type { ChatbotMessage } from "@/types/chatbot";
import { useMemo } from "react";
import { useChatbotMessages } from "@/hooks/swr/useChatbots";
import { chatbotDisplayMessage } from "@/lib/chatbots/display";
import { ContentBox } from "@/components/Shared/KonvoVoice/ContentBox";
import { RetryErrorCard } from "@/components/ui/retry-error-card";
export default function ChatbotTranscript({
  conversationId,
  publicShortId,
  studentLabel = "Student",
  pendingMessage,
  streamingMessage,
  replyPending = false,
  fillFrame = false,
  deferImages = false,
}: {
  conversationId: string | null;
  publicShortId?: string;
  studentLabel?: string;
  pendingMessage?: ChatbotMessage | null;
  streamingMessage?: ChatbotMessage | null;
  replyPending?: boolean;
  fillFrame?: boolean;
  deferImages?: boolean;
}) {
  const { data, error, mutate } = useChatbotMessages(conversationId, publicShortId);
  const messages = useMemo(() => {
    const live =
      streamingMessage?.conversation_id === conversationId
        ? streamingMessage
        : null;
    const stored = (data ?? []).filter(
      (message) =>
        !(
          (live || replyPending) &&
          message.role === "assistant" &&
          message.status === "pending"
        ),
    );
    const rows =
      pendingMessage?.conversation_id === conversationId &&
      !stored.some((message) => message.id === pendingMessage.id)
        ? [...stored, pendingMessage]
        : stored;
    const messages = rows.map((message) => {
      const display = chatbotDisplayMessage(message);
      display.showOriginalImages = !fillFrame;
      if (fillFrame && display.deliveryStatus === "pending")
        display.deliveryStatus = undefined;
      return display;
    });
    if (live?.content)
      messages.push({
        ...chatbotDisplayMessage(live),
        deliveryStatus: undefined,
        streaming: true,
        deferImages,
      });
    return messages;
  }, [
    data,
    pendingMessage,
    streamingMessage,
    conversationId,
    replyPending,
    fillFrame, deferImages,
  ]);
  if (error)
    return (
      <RetryErrorCard
        message="Could not load messages."
        variant="block"
        retryable
        onRetry={() => void mutate()}
      />
    );
  return (
    <div
      className={fillFrame ? "flex min-h-0 flex-1 flex-col" : undefined}
      aria-label="Conversation transcript"
    >
      <ContentBox
        key={conversationId}
        content={null}
        className={
          fillFrame ? "h-full min-h-0 flex-1 rounded-none border-0" : undefined
        }
        scrollMode={fillFrame ? "follow" : "always-new"}
        pendingReply={
          replyPending &&
          !(
            streamingMessage?.conversation_id === conversationId &&
            streamingMessage.content
          )
        }
        messages={messages}
        speechMode="none"
        readOnly
        studentLabel={studentLabel}
        assistantLabel="Bot"
        animateActions={false}
      />
    </div>
  );
}
