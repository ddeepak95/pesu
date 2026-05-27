"use client";

import React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AudioWaveform } from "./AudioWaveform";

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
  }>;
  expandedMessageIds?: Record<string, boolean>;
  onToggleExpanded?: (messageId: string) => void;
}

export function ContentBox({
  content,
  messages,
  expandedMessageIds,
  onToggleExpanded,
}: ContentBoxProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages?.length]);

  return (
    <div className="flex flex-col flex-1 min-h-0 rounded-xl border border-border bg-muted/20 p-4 overflow-hidden">
      <p className="text-sm font-semibold text-muted-foreground mb-3">Content Box</p>

      {messages && messages.length > 0 ? (
        <div
          ref={scrollRef}
          className="flex h-80 flex-col justify-end gap-3 overflow-auto rounded-lg border border-dashed border-border bg-background/50 p-3"
        >
          {messages.map((m) => {
            const isStudent = m.role === "student";
            const expanded = Boolean(expandedMessageIds?.[m.id]);

            return (
              <div
                key={m.id}
                className={`flex items-end gap-2 ${isStudent ? "flex-row-reverse" : "flex-row"}`}
              >
                <div
                  className={`max-w-[95%] sm:max-w-[80%] px-4 py-2.5 text-sm whitespace-pre-wrap shadow-sm ${
                    isStudent
                      ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md"
                      : "bg-card border border-border text-card-foreground rounded-2xl rounded-bl-md"
                  }`}
                >
                  {!isStudent ? (
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <div className="text-xs font-medium text-muted-foreground">
                        Konvo
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-2 mb-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-full bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/15"
                        aria-label={expanded ? "Hide transcript" : "Show transcript"}
                        aria-pressed={expanded}
                        onClick={() => onToggleExpanded?.(m.id)}
                      >
                        {expanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  )}

                  {isStudent ? (
                    <div>
                      <div className="flex items-center justify-center">
                        <AudioWaveform
                          mode="audio"
                          analyser={null}
                          active={false}
                          className="w-full max-w-[240px] text-primary-foreground"
                        />
                      </div>
                      <div
                        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
                          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-80"
                        }`}
                      >
                        <div className="overflow-hidden">
                          <div className="mt-2">{m.content}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>{m.content}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : !content ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-background/50">
          <p className="text-sm text-muted-foreground text-center px-6">
            Multimodal content from Konvo will appear here.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3 overflow-auto">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {content.kind}
          </span>
          <h2 className="text-lg font-semibold text-foreground">{content.title}</h2>
          {content.description ? (
            <p className="text-sm text-muted-foreground leading-relaxed">
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
  );
}
