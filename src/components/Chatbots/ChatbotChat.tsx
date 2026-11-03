"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  useChatbot,
  usePublicChatbotSession,
  useChatbotConversations,
  invalidateChatbots,
} from "@/hooks/swr/useChatbots";
import { streamChatbotTurn } from "@/lib/chatbots/stream";
import { postChatbotAction } from "@/lib/queries/chatbots";
import { LanguageSelect } from "@/components/Shared/LanguageSelect";
import PageTitle from "@/components/Shared/PageTitle";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  chatbotConversationLanguage,
  chatbotAllowance,
} from "@/lib/chatbots/config";
import type { Chatbot, ChatbotMessage } from "@/types/chatbot";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RetryErrorCard } from "@/components/ui/retry-error-card";
import { UserInputPanel } from "@/components/Shared/KonvoVoice/UserInputPanel";
import { getKonvoUiConfig } from "@/components/Shared/KonvoVoice/uiState";
import { StudentPreviewOverlay } from "@/components/Shared/StudentPreviewOverlay";
import ChatbotTranscript from "./ChatbotTranscript";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export default function ChatbotChat({
  initialBot,
  preview = false,
  publicMode = false,
  onExit,
  onEndConversation,
  ending = false,
  backAction,
  onLogout,
}: {
  initialBot: Chatbot;
  preview?: boolean;
  publicMode?: boolean;
  onExit?: () => void;
  onEndConversation?: () => void;
  ending?: boolean;
  backAction?: ReactNode;
  onLogout?: () => Promise<void>;
}) {
  const { data: currentBot } = useChatbot(publicMode ? null : initialBot.chatbot_id);
  const { data: publicSession } = usePublicChatbotSession(publicMode ? initialBot.chatbot_id : null);
  const bot = publicSession?.bot ?? currentBot ?? initialBot;
  const { data: conversations, error: readError } = useChatbotConversations(
    bot.id,
    preview,
    publicMode ? bot.chatbot_id : undefined,
  );
  const allowance = chatbotAllowance(
    preview ? { ...bot, max_conversations: null } : bot,
    conversations ?? [],
  );
  const selected = allowance.latest;
  const [initialLanguage, setInitialLanguage] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState<ChatbotMessage | null>(
    null,
  );
  const [streamingMessage, setStreamingMessage] =
    useState<ChatbotMessage | null>(null);
  const openingAttempt = useRef<string | null>(null);
  const [content, setContent] = useState("");
  const actionInFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restartOpen, setRestartOpen] = useState(false);
  const isLatest = selected?.id === allowance.latest?.id;
  const busyElsewhere =
    !!allowance.latest?.pending_message_id &&
    !!allowance.latest.pending_until &&
    new Date(allowance.latest.pending_until).getTime() > Date.now();

  const act = useCallback(async (action: () => Promise<void>) => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setStreamingMessage(null);
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      try {
        await invalidateChatbots();
      } catch {
        setError(
          (previous) =>
            previous ??
            "Could not refresh the conversation. Refresh the page before sending again.",
        );
      } finally {
        actionInFlight.current = false;
        setPending(false);
        setPendingMessage(null);
        setStreamingMessage(null);
      }
    }
  }, []);

  const streamReply = useCallback(
    async (
      conversationId: string,
      messageId: string,
      opening: boolean,
      text?: string,
    ) => {
      setStreamingMessage({
        id: `stream-${messageId}`,
        conversation_id: conversationId,
        role: "assistant",
        content: "",
        status: "pending",
        sources: [],
        search_entry_point: null,
        ai_invocation_id: null,
        created_at: new Date().toISOString(),
      });
      await streamChatbotTurn(
        bot.chatbot_id,
        { preview, publicMode, opening, conversationId, messageId, content: text },
        (delta) =>
          setStreamingMessage((message) =>
            message
              ? { ...message, content: message.content + delta }
              : message,
          ),
      );
    },
    [bot.chatbot_id, preview, publicMode],
  );
  const startOpening = useCallback(() => {
    if (!allowance.latest) return;
    openingAttempt.current = allowance.latest.id;
    void act(() =>
      streamReply(allowance.latest!.id, crypto.randomUUID(), true),
    );
  }, [allowance.latest, act, streamReply]);
  useEffect(() => {
    if (
      allowance.latest &&
      !allowance.latest.opening_complete &&
      !allowance.latest.closed_at &&
      !pending &&
      !busyElsewhere &&
      openingAttempt.current !== allowance.latest.id
    )
      startOpening();
  }, [allowance.latest, pending, busyElsewhere, startOpening]);

  function send() {
    if (
      pending ||
      ending ||
      busyElsewhere ||
      !selected ||
      !isLatest ||
      !selected.opening_complete ||
      allowance.turnsRemaining === 0 ||
      !content.trim()
    )
      return;
    void act(async () => {
      const messageId = crypto.randomUUID();
      setPendingMessage({
        id: messageId,
        conversation_id: selected.id,
        role: "user",
        content,
        status: "pending",
        sources: [],
        search_entry_point: null,
        ai_invocation_id: null,
        created_at: new Date().toISOString(),
      });
      await streamReply(selected.id, messageId, false, content);
      setContent("");
    });
  }

  const ui = getKonvoUiConfig("user_idle", false);
  const replyPending =
    !error &&
    !!selected &&
    (streamingMessage?.conversation_id === selected.id ||
      (!!selected.pending_message_id &&
        !!selected.pending_until &&
        new Date(selected.pending_until).getTime() > Date.now()));
  const inputDisabled =
    !selected ||
    !isLatest ||
    !!selected.closed_at ||
    !selected.opening_complete ||
    allowance.turnsRemaining === 0 ||
    pending ||
    busyElsewhere ||
    ending;
  const chat = (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
        {backAction && <div className="shrink-0">{backAction}</div>}
        <PageTitle title={bot.title} className="min-w-0 flex-1 basis-40 border-0 pb-0" />
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-center gap-2">
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Label htmlFor="conversation-language" className="font-normal">Language:</Label>
          <InfoTooltip text="The language the bot uses throughout the conversation." />
        </div>
        <LanguageSelect
          id="conversation-language"
          className="w-[180px] max-w-full"
          value={chatbotConversationLanguage(bot, selected ? selected.language : initialLanguage)}
          disabled={conversations === undefined || (!!selected && (!isLatest || !!selected.closed_at)) || bot.lock_language || pending || busyElsewhere || ending}
          onValueChange={(language) => {
            if (conversations === undefined || bot.lock_language || pending || busyElsewhere || ending) return;
            if (!selected) {
              setInitialLanguage(language);
              return;
            }
            if (!isLatest || selected.closed_at) return;
            void act(() =>
              postChatbotAction(bot.chatbot_id, "conversation", {
                preview,
                publicMode,
                conversationId: selected.id,
                language,
              }),
            );
          }}
        />
        {selected && (
              <Button variant="outline" disabled={pending || busyElsewhere || ending || !allowance.canRestart} onClick={() => setRestartOpen(true)}>
                Restart Conversation
                {!preview && allowance.additionalConversationsRemaining !== null && (
                  <span className="text-xs text-muted-foreground">
                    ({allowance.additionalConversationsRemaining} available)
                  </span>
                )}
              </Button>
        )}
        {publicMode && onLogout && (
          <Button variant="outline" disabled={pending || busyElsewhere} onClick={() => void act(onLogout)}>
            Log out
          </Button>
        )}
        </div>
      </div>

      {(readError || error) && (
        <div className="shrink-0 break-words">
        <RetryErrorCard
          message={error || "Could not load conversations."}
          variant="block"
          retryable={!!readError}
          onRetry={() => void invalidateChatbots()}
        />
        </div>
      )}
      {conversations && (
        <>
          <div className="flex min-h-[16rem] flex-1 flex-col overflow-hidden rounded-xl border border-border">
            {!allowance.latest ? (
              <div className="flex flex-1 items-center justify-center p-6">
                <Button
                  disabled={pending}
                  onClick={() =>
                    void act(async () => {
                      await postChatbotAction(bot.chatbot_id, "conversation", {
                        preview,
                        publicMode,
                        restart: false,
                        initialLanguage: chatbotConversationLanguage(bot, initialLanguage),
                      });
                    })
                  }
                >
                  {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Start conversation
                </Button>
              </div>
            ) : (
              <ChatbotTranscript
                conversationId={selected?.id ?? null}
                studentLabel="You"
                publicShortId={publicMode ? bot.chatbot_id : undefined}
                pendingMessage={pendingMessage}
                streamingMessage={streamingMessage}
                replyPending={replyPending}
                fillFrame
              />
            )}
            {selected && (
              <div className="shrink-0 border-t border-border bg-background">
                {!isLatest || selected.closed_at ? (
                  <p className="px-4 pt-3 text-sm text-muted-foreground">
                    This is a previous conversation. You can read it, but cannot
                    send more messages.
                  </p>
                ) : allowance.turnsRemaining === 0 ? (
                  <p className="px-4 pt-3 text-sm text-muted-foreground">
                    You have reached the turn limit for this conversation.
                  </p>
                ) : null}
                {isLatest &&
                  !selected.closed_at &&
                  !selected.opening_complete &&
                  !pending &&
                  !busyElsewhere && (
                    <Button
                      className="mx-4 mt-3"
                      variant="outline"
                      onClick={startOpening}
                    >
                      Retry opening message
                    </Button>
                  )}
                <UserInputPanel
                  variant="composer"
                  ui={ui}
                  audioEnabled={false}
                  textEnabled
                  textValue={isLatest ? content : ""}
                  onTextChange={setContent}
                  onTextSubmit={send}
                  canSubmitText={!inputDisabled && !!content.trim()}
                  inputsDisabled={inputDisabled}
                  placeholder={
                    !isLatest || selected.closed_at
                      ? "Read-only conversation"
                      : allowance.turnsRemaining === 0
                        ? "Conversation turn limit reached"
                        : !selected.opening_complete
                          ? "Waiting for the opening message..."
                          : "Message the chatbot..."
                  }
                  allowCopyPaste
                  maxLength={10000}
                  sendAccessory={
                    <div className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
                      <span aria-live="polite" aria-label={`${selected.turns_used} of ${bot.turn_limit} turns used`}>
                        {selected.turns_used}/{bot.turn_limit}
                      </span>
                      <InfoTooltip text={`Student turns used out of the conversation limit. ${allowance.turnsRemaining} remaining. The opening greeting and failed replies do not use a turn.`} />
                    </div>
                  }
                />
              </div>
            )}
          </div>
          {selected && onEndConversation && (
            <div className="flex shrink-0 flex-wrap items-center justify-center gap-3">
              {onEndConversation && (
                <Button variant="outline" disabled={pending || busyElsewhere || ending} onClick={onEndConversation}>
                  {ending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Finish Conversation
                </Button>
              )}

            </div>
          )}
        </>
      )}
      <Dialog open={restartOpen} onOpenChange={setRestartOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restart conversation?</DialogTitle>
            <DialogDescription>
              {preview
                ? "This starts a fresh preview with a new turn allowance."
                : "This begins a fresh conversation and uses one of your remaining conversations."}{" "}
              Your previous transcript is preserved, but you cannot send more messages to it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestartOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                void act(async () => {
                  await postChatbotAction(bot.chatbot_id, "conversation", {
                    preview,
                  publicMode,
                    restart: true,
                    expectedId: allowance.latest?.id,
                  });
                  setContent("");
                  setRestartOpen(false);
                })
              }
            >
              Restart Conversation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
  return preview ? (
    <StudentPreviewOverlay
      onExit={onExit!}
      onRestart={() => setRestartOpen(true)}
      restartDisabled={pending || busyElsewhere || !allowance.latest}
      restarting={pending}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex h-full min-h-[32rem] w-full max-w-3xl flex-col px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          {chat}
        </div>
      </div>
    </StudentPreviewOverlay>
  ) : (
    chat
  );
}
