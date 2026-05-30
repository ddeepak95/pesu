"use client";

import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionCard } from "./ActionCard";
import type { PendingAction } from "./actionTypes";

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
  }>;
  expandedMessageIds?: Record<string, boolean>;
  onToggleExpanded?: (messageId: string) => void;
  onMcqAnswer?: (messageId: string, choiceIndex: number) => void;
}

export function ContentBox({
  content,
  messages,
  expandedMessageIds,
  onToggleExpanded,
  onMcqAnswer,
}: ContentBoxProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const prevMessageCountRef = React.useRef(0);
  const [knownMessageIds, setKnownMessageIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  // Dotted WhatsApp-style background, kept subtle for readability.
  const staticWaveHeights = React.useMemo(
    () => [22, 12, 17, 10, 14, 19, 13, 9, 15, 11, 20, 16, 12, 18, 10, 15, 19, 9, 14, 17],
    [],
  );

  const newMessageIds = React.useMemo(() => {
    const ids: string[] = [];
    if (!messages) return ids;
    for (const m of messages) {
      if (!knownMessageIds.has(m.id)) ids.push(m.id);
    }
    return ids;
  }, [messages, knownMessageIds]);

  const newMessageIdsSet = React.useMemo(() => new Set(newMessageIds), [newMessageIds]);

  React.useEffect(() => {
    if (newMessageIds.length === 0) return;
    setKnownMessageIds((prev) => {
      const next = new Set(prev);
      for (const id of newMessageIds) next.add(id);
      return next;
    });
  }, [newMessageIds]);

  React.useLayoutEffect(() => {
    const count = messages?.length ?? 0;
    if (count === 0) {
      prevMessageCountRef.current = 0;
      return;
    }
    const el = scrollRef.current;
    if (!el) return;

    const isNewMessage = count > prevMessageCountRef.current;
    prevMessageCountRef.current = count;

    // Scroll on a new message, or when content (e.g. an MCQ card growing from
    // skeleton to full question) changes while already near the bottom — so the
    // user is never left scrolled up against their will.
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (!isNewMessage && !nearBottom) return;

    const scrollToEnd = () => {
      const endTop = Math.max(0, el.scrollHeight - el.clientHeight);
      if (endTop > 0) {
        el.scrollTop = endTop;
      }
    };

    // Instant scroll before paint; one rAF retry if layout was not ready yet.
    scrollToEnd();
    const raf = requestAnimationFrame(scrollToEnd);
    return () => cancelAnimationFrame(raf);
  }, [messages]);

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
      className="relative flex h-96 flex-col rounded-xl border border-border bg-muted/30 p-3 overflow-hidden
                 bg-[radial-gradient(circle_at_1px_1px,rgba(161,98,7,0.14)_1px,transparent_0)]
                 bg-[length:18px_18px]
                 dark:bg-[radial-gradient(circle_at_1px_1px,rgba(161,98,7,0.20)_1px,transparent_0)]
                 dark:bg-[length:18px_18px]"
      style={{ backgroundColor: "rgba(161,98,7,0.06)" }}
    >
      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-y-auto"
      >
        <div className="flex min-h-full flex-col">
          <div className="min-h-0 flex-1 shrink-0" aria-hidden />
          <div className="flex flex-col gap-3">
            {messages?.map((m) => {
            if (m.hidden) return null;
            const isStudent = m.role === "student";

            // Action-only message (e.g. an MCQ card): render just the card.
            if (m.action && !m.content) {
              return (
                <div
                  key={m.id}
                  className="flex flex-row"
                  style={{ animation: "konvoCardPop 480ms ease-out both" }}
                >
                  <div
                    className="w-full max-w-[95%] rounded-xl sm:max-w-[85%]"
                    style={{ animation: "konvoCardRing 1100ms ease-out 220ms 1" }}
                  >
                    <ActionCard
                      action={m.action}
                      onMcqAnswer={
                        onMcqAnswer
                          ? (index) => onMcqAnswer(m.id, index)
                          : undefined
                      }
                    />
                  </div>
                </div>
              );
            }

            const isStreaming = m.role === "assistant" && Boolean(m.streaming);
            const expanded = Boolean(expandedMessageIds?.[m.id]);

              return (
                <div
                  key={m.id}
                  className={`flex items-end gap-2 ${isStudent ? "flex-row-reverse" : "flex-row"}`}
                  style={
                    newMessageIdsSet.has(m.id)
                      ? { animation: "konvoBubbleIn 900ms ease-out both" }
                      : undefined
                  }
                >
                  <div
                    className={`relative max-w-[95%] sm:max-w-[80%] px-3 py-2 text-sm whitespace-pre-wrap shadow-sm transition-all duration-500 ease-out ${
                      isStudent
                        ? "bg-muted text-foreground border border-border/60 rounded-2xl rounded-br-sm"
                        : "bg-muted/70 border border-border/60 text-foreground rounded-2xl rounded-bl-sm"
                    }`}
                  >
                  <div
                    className={`mb-2 flex items-center ${isStudent ? "justify-between" : "justify-between"}`}
                  >
                    <div
                      className="text-sm font-semibold text-foreground"
                    >
                      {isStudent ? "You" : "Konvo"}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto px-0 text-sm font-normal text-foreground/80 underline-offset-2 hover:text-foreground hover:underline"
                      aria-label={expanded ? "Hide message" : "View message"}
                      aria-pressed={expanded}
                      onClick={() => onToggleExpanded?.(m.id)}
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
                  </div>

                  <div>
                    {!expanded ? (
                    <div className="flex h-9 items-end gap-1">
                        {staticWaveHeights.map((h, index) => (
                          <span
                            key={`${m.id}-bar-${index}`}
                            className={`block w-1 rounded-full ${
                              isStudent ? "bg-foreground/90" : "bg-foreground/90"
                            }`}
                            style={{ height: `${h}px` }}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="mt-1">{m.content}</div>
                    )}
                  </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {(!messages || messages.length === 0) && !content ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-sm text-muted-foreground">Enjoy learning</span>
          </div>
        ) : null}
        {content && (!messages || messages.length === 0) ? (
          <div className="flex h-full flex-col gap-3 overflow-auto">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {content.kind}
            </span>
            <h2 className="text-lg font-semibold text-foreground">{content.title}</h2>
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
