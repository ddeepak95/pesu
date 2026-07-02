"use client";

import MarkdownContent from "@/components/Shared/MarkdownContent";
import type { DisplayContentActionPayload } from "@/lib/multimodal/actions/types";

interface DisplayContentCardProps {
  payload: DisplayContentActionPayload;
}

export function DisplayContentCard({ payload }: DisplayContentCardProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-3">
      {payload.title ? (
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {payload.title}
        </p>
      ) : null}
      <MarkdownContent content={payload.content} className="space-y-2" />
    </div>
  );
}
