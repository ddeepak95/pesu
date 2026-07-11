"use client";

import React from "react";
import { ChevronDown, ChevronRight, Loader2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionCard, type TtsConfig } from "./ActionCard";
import { useOnDemandTts } from "./useOnDemandTts";
import { cn } from "@/lib/utils";
import type { PendingAction, ChatTurnError } from "./actionTypes";
import { ChatTurnErrorBubble } from "./ChatTurnErrorBubble";
import type { TransliterationResult } from "@/lib/ai/schemas/transliteration";

type ContentDisplay = {
  kind: string;
  title: string;
  description?: string;
  url?: string;
};

interface ContentBoxProps {
  content: ContentDisplay | null;
  messages?: Array<{
    id: string;
    role: "student" | "assistant";
    content: string;
    status?: "transcribing";
    streaming?: boolean;
    action?: PendingAction;
    hidden?: boolean;
    typed?: boolean;
    /** Present on a failed AI-turn bubble — renders the retry UI in place. */
    error?: ChatTurnError;
  }>;
  expandedMessageIds?: Record<string, boolean>;
  onToggleExpanded?: (messageId: string) => void;
  onMcqAnswer?: (messageId: string, choiceIndex: number) => void;
  transliterationEnabled?: boolean;
  transliterations?: Record<string, TransliterationResult>;
  transliterationPending?: Record<string, boolean>;
  onRequestTransliteration?: (messageId: string) => void;
  audioAvailableIds?: Set<string>;
  onReplayAudio?: (messageId: string) => void;
  playingMessageId?: string | null;
  ttsConfig?: TtsConfig;
  readOnly?: boolean;
  className?: string;
  animateActions?: boolean;
  autoScroll?: boolean;
  /** Label shown on student bubbles (e.g. "You" in the live view, "Student" for teachers). */
  studentLabel?: string;
  /** Retry a failed AI turn (rendered as an error bubble). */
  onRetryTurn?: (messageId: string) => void;
  /** Retry a failed action card's generation. */
  onActionRetry?: (messageId: string) => void;
  /** Disables retry while a turn is in flight. */
  retryDisabled?: boolean;
  /** Number of manual retries already attempted (for the "Retry (n)" label). */
  retryAttemptCount?: number;
  /**
   * Tutor speech-output mode. "automatic" (default) keeps the collapsed-waveform
   * bubble with a "View message" toggle; "on_demand"/"none" show the message text
   * directly. "on_demand" also offers a per-message tap-to-hear play button.
   */
  speechMode?: "automatic" | "on_demand" | "none";
}

export function ContentBox({
  content,
  messages,
  expandedMessageIds,
  onToggleExpanded,
  onMcqAnswer,
  transliterationEnabled,
  transliterations,
  transliterationPending,
  onRequestTransliteration,
  audioAvailableIds,
  onReplayAudio,
  playingMessageId,
  ttsConfig,
  readOnly,
  className,
  animateActions = true,
  autoScroll = true,
  studentLabel = "You",
  speechMode = "automatic",
  onRetryTurn,
  onActionRetry,
  retryDisabled,
  retryAttemptCount,
}: ContentBoxProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const prevMessageCountRef = React.useRef(0);
  const [knownMessageIds, setKnownMessageIds] = React.useState<Set<string>>(
    () => new Set(),
  );

  const newMessageIds = React.useMemo(() => {
    const ids: string[] = [];
    if (!messages) return ids;
    for (const m of messages) {
      if (!knownMessageIds.has(m.id)) ids.push(m.id);
    }
    return ids;
  }, [messages, knownMessageIds]);

  const newMessageIdsSet = React.useMemo(
    () => new Set(newMessageIds),
    [newMessageIds],
  );

  React.useEffect(() => {
    if (newMessageIds.length === 0) return;
    setKnownMessageIds((prev) => {
      const next = new Set(prev);
      for (const id of newMessageIds) next.add(id);
      return next;
    });
  }, [newMessageIds]);

  React.useLayoutEffect(() => {
    if (!autoScroll) return;
    const count = messages?.length ?? 0;
    if (count === 0) {
      prevMessageCountRef.current = 0;
      return;
    }
    const el = scrollRef.current;
    if (!el) return;

    const isNewMessage = count > prevMessageCountRef.current;
    prevMessageCountRef.current = count;

    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (!isNewMessage && !nearBottom) return;

    const scrollToEnd = () => {
      const endTop = Math.max(0, el.scrollHeight - el.clientHeight);
      if (endTop > 0) {
        el.scrollTop = endTop;
      }
    };

    scrollToEnd();
    const raf = requestAnimationFrame(scrollToEnd);
    return () => cancelAnimationFrame(raf);
  }, [autoScroll, messages]);

  return (
    <>
      <style>
        {`
          @keyframes konvoBubbleIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes konvoCardPop {
            0% { opacity: 0; transform: translateY(8px) scale(0.96); }
            55% { opacity: 1; transform: translateY(0) scale(1.015); }
            100% { transform: scale(1); }
          }
          @keyframes konvoCardRing {
            0% { box-shadow: 0 0 0 0 rgba(161,98,7,0.5); }
            100% { box-shadow: 0 0 0 10px rgba(161,98,7,0); }
          }
        `}
      </style>
      <div
        className={cn(
          "relative flex h-96 flex-col rounded-xl border border-border bg-muted/30 overflow-hidden",
          className
        )}
      >
        <div
          ref={scrollRef}
          className="relative min-h-0 flex-1 overflow-y-auto p-4 bg-[radial-gradient(circle_at_1px_1px,rgba(161,98,7,0.14)_1px,transparent_0)] bg-[length:18px_18px] dark:bg-[radial-gradient(circle_at_1px_1px,rgba(161,98,7,0.20)_1px,transparent_0)] dark:bg-[length:18px_18px]"
          // translateZ(0) promotes the scroll layer so Chromium invalidates it
          // correctly — without it, the bubbles' box-shadow leaves repaint
          // trails ("ghost shadow") while scrolling.
          style={{
            backgroundColor: "rgba(161,98,7,0.06)",
            transform: "translateZ(0)",
          }}
        >
          <div className="flex min-h-full flex-col">
            <div className="min-h-0 flex-1 shrink-0" aria-hidden />
            <div className="flex flex-col gap-3">
              {messages?.map((m) => {
                if (m.hidden) return null;

                if (m.error && !m.content) {
                  return (
                    <ChatTurnErrorBubble
                      key={m.id}
                      error={m.error}
                      onRetry={
                        onRetryTurn ? () => onRetryTurn(m.id) : undefined
                      }
                      disabled={retryDisabled}
                      attemptCount={retryAttemptCount}
                    />
                  );
                }

                if (m.action && !m.content) {
                  return (
                    <div
                      key={m.id}
                      className="flex flex-row"
                      style={
                        animateActions
                          ? { animation: "konvoCardPop 480ms ease-out both" }
                          : undefined
                      }
                    >
                      <div
                        className="w-full max-w-[95%] rounded-xl sm:max-w-[85%]"
                        style={
                          animateActions
                            ? {
                                animation: "konvoCardRing 1100ms ease-out 220ms 1",
                              }
                            : undefined
                        }
                      >
                        <ActionCard
                          action={m.action}
                          onMcqAnswer={
                            onMcqAnswer
                              ? (index) => onMcqAnswer(m.id, index)
                              : undefined
                          }
                          ttsConfig={ttsConfig}
                          onRetry={
                            onActionRetry
                              ? () => onActionRetry(m.id)
                              : undefined
                          }
                          retryDisabled={retryDisabled}
                        />
                      </div>
                    </div>
                  );
                }

                return (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    isNew={newMessageIdsSet.has(m.id)}
                    expanded={Boolean(expandedMessageIds?.[m.id])}
                    onToggleExpanded={() => onToggleExpanded?.(m.id)}
                    audioAvailable={audioAvailableIds?.has(m.id)}
                    isPlaying={playingMessageId === m.id}
                    onReplayAudio={() => onReplayAudio?.(m.id)}
                    transliterationEnabled={transliterationEnabled}
                    transliteration={transliterations?.[m.id]}
                    transliterationPending={Boolean(transliterationPending?.[m.id])}
                    onRequestTransliteration={() => onRequestTransliteration?.(m.id)}
                    readOnly={readOnly}
                    studentLabel={studentLabel}
                    speechMode={speechMode}
                    ttsConfig={ttsConfig}
                  />
                );
              })}
            </div>
          </div>
          {(!messages || messages.length === 0) && !content ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="text-sm text-muted-foreground">
                Enjoy learning
              </span>
            </div>
          ) : null}
          {content && (!messages || messages.length === 0) ? (
            <div className="flex h-full flex-col gap-3 overflow-auto">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {content.kind}
              </span>
              <h2 className="text-lg font-semibold text-foreground">
                {content.title}
              </h2>
              {content.description ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {content.description}
                </p>
              ) : null}
              {content.url ? (
                <a
                  href={content.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary underline-offset-2 hover:underline"
                >
                  Open resource
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

const STATIC_WAVE_HEIGHTS = [
  22, 12, 17, 10, 14, 19, 13, 9, 15, 11, 20, 16, 12, 18, 10, 15, 19, 9, 14, 17,
];

interface MessageBubbleProps {
  message: {
    id: string;
    role: "student" | "assistant";
    content: string;
    status?: "transcribing";
    streaming?: boolean;
    typed?: boolean;
  };
  isNew: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  audioAvailable?: boolean;
  isPlaying?: boolean;
  onReplayAudio?: () => void;
  transliterationEnabled?: boolean;
  transliteration?: TransliterationResult;
  transliterationPending?: boolean;
  onRequestTransliteration?: () => void;
  readOnly?: boolean;
  studentLabel?: string;
  speechMode?: "automatic" | "on_demand" | "none";
  ttsConfig?: TtsConfig;
}

function MessageBubble({
  message: m,
  isNew,
  expanded,
  onToggleExpanded,
  audioAvailable,
  isPlaying,
  onReplayAudio,
  transliterationEnabled,
  transliteration,
  transliterationPending,
  onRequestTransliteration,
  readOnly,
  studentLabel = "You",
  speechMode = "automatic",
  ttsConfig,
}: MessageBubbleProps) {
  const isStudent = m.role === "student";
  const isStreaming = m.role === "assistant" && Boolean(m.streaming);
  // Show message text directly (no collapsed waveform placeholder, no "View
  // message" toggle) when there's no audio to represent as a waveform. For the
  // student that's only when they *typed* (a spoken turn always has audio,
  // regardless of the tutor's output mode). For the tutor it's any non-automatic
  // output mode (on_demand/none produce no auto-played audio).
  const textOutput = isStudent ? Boolean(m.typed) : speechMode !== "automatic";
  const onDemandTts = useOnDemandTts(ttsConfig);
  // on_demand: assistant replies get a tap-to-hear button that synthesizes from
  // the message text (the live turn produced no audio).
  const showOnDemandPlay =
    speechMode === "on_demand" &&
    !isStudent &&
    !isStreaming &&
    Boolean(m.content.trim()) &&
    Boolean(ttsConfig);

  return (
    <div
      className={`flex items-end gap-2 ${isStudent ? "flex-row-reverse" : "flex-row"}`}
      style={isNew ? { animation: "konvoBubbleIn 900ms ease-out both" } : undefined}
    >
      <div
        className={`relative min-w-[10rem] max-w-[95%] sm:max-w-[80%] px-3 py-2 text-sm whitespace-pre-wrap shadow-sm transition-colors duration-500 ease-out ${
          isStudent
            ? "bg-muted text-foreground border border-border/60 rounded-2xl rounded-br-sm"
            : "bg-muted/70 border border-border/60 text-foreground rounded-2xl rounded-bl-sm"
        }`}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-foreground">
            {isStudent ? studentLabel : "Konvo"}
          </div>
          <div className="flex items-center gap-1">
            {!isStreaming && audioAvailable ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto px-1 text-foreground/60 hover:text-foreground"
                aria-label={isPlaying ? "Pause audio" : "Play audio"}
                onClick={onReplayAudio}
              >
                {isPlaying ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
              </Button>
            ) : showOnDemandPlay ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto px-1 text-foreground/60 hover:text-foreground"
                aria-label={onDemandTts.isPlaying ? "Pause audio" : "Play audio"}
                onClick={() => void onDemandTts.play(m.content)}
              >
                {onDemandTts.isPlaying ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
              </Button>
            ) : null}
            {!readOnly && !textOutput && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto px-0 text-sm font-normal text-foreground/80 underline-offset-2 hover:text-foreground hover:underline"
                aria-label={expanded ? "Hide message" : "View message"}
                aria-pressed={expanded}
                onClick={onToggleExpanded}
              >
                {isStreaming ? (
                  <span className="inline-flex items-center gap-0.5 italic">
                    Speaking
                    {expanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </span>
                ) : expanded ? (
                  "Hide message"
                ) : (
                  "View message"
                )}
              </Button>
            )}
          </div>
        </div>

        <div>
          {!expanded && !textOutput ? (
            <div className="flex h-9 items-end gap-1">
              {STATIC_WAVE_HEIGHTS.map((h, index) => (
                <span
                  key={`${m.id}-bar-${index}`}
                  className="block w-1 rounded-full bg-foreground/90"
                  style={{ height: `${h}px` }}
                />
              ))}
            </div>
          ) : (
            <div className="mt-1">{m.content}</div>
          )}
          {!isStudent && (expanded || textOutput) && transliterationEnabled ? (
            <div className="mt-2 border-t border-border/40 pt-2">
              {transliteration ? (
                <div className="space-y-1">
                  {transliteration.transliteration ? (
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                      {transliteration.transliteration}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground italic whitespace-pre-wrap">
                    {transliteration.translation}
                  </p>
                </div>
              ) : transliterationPending ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />{" "}
                  Translating...
                </span>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto px-0 text-xs text-muted-foreground hover:text-foreground"
                  disabled={Boolean(m.streaming)}
                  onClick={onRequestTransliteration}
                >
                  Translate
                </Button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
