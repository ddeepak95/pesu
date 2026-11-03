"use client";

import { useRef, useState } from "react";
import { usePublicChatbotSession, invalidateChatbots, clearPublicChatbotCache } from "@/hooks/swr/useChatbots";
import { postChatbotAction } from "@/lib/queries/chatbots";
import PageLayout from "@/components/PageLayout";
import { PublicEntryCard } from "@/components/Public/PublicEntryCard";
import ResponderDetailsForm from "@/components/Public/ResponderDetailsForm";
import { RetryErrorCard } from "@/components/ui/retry-error-card";
import ChatbotChat from "./ChatbotChat";
import { LanguageSelect } from "@/components/Shared/LanguageSelect";
import { Label } from "@/components/ui/label";
import { chatbotConversationLanguage } from "@/lib/chatbots/config";
import type { ResponderFieldConfig } from "@/types/assignment";

const fields: ResponderFieldConfig[] = [{ field: "name", type: "text", label: "Your name", required: true, placeholder: "Enter your name" }];

export default function PublicChatbot({ shortId }: { shortId: string }) {
  const { data, error: readError, mutate } = usePublicChatbotSession(shortId);
  const submitting = useRef(false);
  const [initialLanguage, setInitialLanguage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function begin(details: Record<string, string>) {
    if (submitting.current || !data) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      await postChatbotAction(shortId, "public", { name: details.name });
      await postChatbotAction(shortId, "conversation", { publicMode: true, restart: false, initialLanguage: chatbotConversationLanguage(data.bot, initialLanguage) });
      await invalidateChatbots();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not begin conversation");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  async function logout() {
    await postChatbotAction(shortId, "public", { action: "logout" });
    await clearPublicChatbotCache(shortId);
    setError(null);
    setInitialLanguage(null);
    if (data) await mutate({ ...data, participant: null }, { revalidate: false });
  }
  return (
    <PageLayout
      variant={data?.participant && !readError ? "chat" : "default"}
      userName={data?.participant?.name}
    >
      {readError ? (
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="w-full max-w-md">
            <RetryErrorCard
              message={readError.message}
              variant="block"
              retryable
              onRetry={() => void mutate()}
            />
          </div>
        </div>
      ) : data ? (
        data.participant ? (
          <ChatbotChat key={data.participant.id} initialBot={data.bot} publicMode onLogout={logout} />
        ) : (
          <PublicEntryCard title={data.bot.title}>
            {error && <RetryErrorCard message={error} variant="block" retryable={false} />}
            <div className="space-y-2">
              <Label htmlFor="public-chatbot-language">Language</Label>
              <LanguageSelect
                id="public-chatbot-language"
                value={chatbotConversationLanguage(data.bot, initialLanguage)}
                onValueChange={setInitialLanguage}
                disabled={pending || data.bot.lock_language}
              />
            </div>
            <fieldset disabled={pending} aria-busy={pending}>
              <ResponderDetailsForm
                fields={fields}
                onSubmit={(details) => void begin(details)}
                submitLabel={pending ? "Starting..." : "Begin Conversation"}
              />
            </fieldset>
          </PublicEntryCard>
        )
      ) : null}
    </PageLayout>
  );
}
