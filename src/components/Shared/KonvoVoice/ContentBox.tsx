"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import type { KonvoUiState } from "./uiState";

type ContentDisplay = {
  kind: string;
  title: string;
  description?: string;
  url?: string;
};

interface ContentBoxProps {
  content: ContentDisplay | null;
  uiState: KonvoUiState;
  messages?: Array<{
    id: string;
    role: "student" | "assistant";
    content: string;
    status?: "transcribing";
  }>;
  expandedMessageIds?: Record<string, boolean>;
  onToggleExpanded?: (messageId: string) => void;
}

export function ContentBox({
  content,
  uiState,
  messages,
  expandedMessageIds,
  onToggleExpanded,
}: ContentBoxProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const scrollRafRef = React.useRef<number | null>(null);
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

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const runScrollAnimation = () => {
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
      const startTop = el.scrollTop;
      const endTop = el.scrollHeight - el.clientHeight;
      if (endTop <= startTop) return;

      const durationMs = 520;
      const startTs = performance.now();
      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

      const step = (now: number) => {
        const elapsed = now - startTs;
        const progress = Math.min(1, elapsed / durationMs);
        const eased = easeOutCubic(progress);
        el.scrollTop = startTop + (endTop - startTop) * eased;
        if (progress < 1) {
          scrollRafRef.current = requestAnimationFrame(step);
        } else {
          scrollRafRef.current = null;
        }
      };

      scrollRafRef.current = requestAnimationFrame(step);
    };

    const layoutRaf = requestAnimationFrame(() => {
      requestAnimationFrame(runScrollAnimation);
    });

    return () => {
      cancelAnimationFrame(layoutRaf);
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [messages]);

  const konvoStatusText = React.useMemo(() => {
    switch (uiState) {
      case "bot_thinking":
        return "Konvo is thinking";
      case "bot_speaking":
        return "Konvo is talking";
      case "user_speaking":
        return "Konvo is listening";
      case "user_listening":
        return "Share your response";
      default:
        return "Konvo is listening";
    }
  }, [uiState]);

  return (
    <>
      <style>
        {`
          @keyframes konvoBubbleIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0px); }
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
      <div ref={scrollRef} className="flex flex-1 flex-col overflow-auto">
        {messages && messages.length > 0 ? (
          <div className="mt-auto flex flex-col gap-3">
            {messages.map((m) => {
            const isStudent = m.role === "student";
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
                      className={`h-auto px-0 text-sm font-normal underline-offset-2 hover:underline ${
                        isStudent
                          ? "text-foreground/80 hover:text-foreground"
                          : "text-foreground/80 hover:text-foreground"
                      }`}
                      aria-label={expanded ? "Hide message" : "View message"}
                      aria-pressed={expanded}
                      onClick={() => onToggleExpanded?.(m.id)}
                    >
                      {expanded ? "Hide message" : "View message"}
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
        ) : !content ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-sm text-muted-foreground">Enjoy learning</span>
          </div>
        ) : (
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
        )}
      </div>
      <div className="mt-2 border-t border-border/50 pt-2 text-center text-xs italic text-muted-foreground">
        {konvoStatusText}
      </div>
    </div>
    </>
  );
}
