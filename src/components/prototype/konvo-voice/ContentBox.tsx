"use client";

import type { ContentDisplay } from "./useTurnBasedVoiceChat";

interface ContentBoxProps {
  content: ContentDisplay | null;
}

export function ContentBox({ content }: ContentBoxProps) {
  return (
    <div className="flex flex-col flex-1 min-h-0 rounded-xl border border-border bg-muted/20 p-4 overflow-hidden">
      <p className="text-sm font-semibold text-muted-foreground mb-3">Content Box</p>

      {!content ? (
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
