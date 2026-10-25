"use client";
/* eslint-disable @next/next/no-img-element -- Images use an attempt-authorized route. */

import MarkdownContent from "@/components/Shared/MarkdownContent";
import type { DisplayContentActionPayload } from "@/lib/multimodal/actions/types";
import { stripPortableFigureImages } from "@/lib/classDocuments/figureMarkdown";

interface DisplayContentCardProps {
  payload: DisplayContentActionPayload;
}

export function DisplayContentCard({ payload }: DisplayContentCardProps) {
  const group = payload.documentFigure;
  const content = group ? stripPortableFigureImages(payload.content) : payload.content;
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-3">
      {payload.title ? (
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {payload.title}
        </p>
      ) : null}
      {content && <MarkdownContent content={content} className="space-y-2" />}
      {group && <div className="mt-3 space-y-3">
        {group.figures.map((figure) => {
          const caption = figure.caption.replace(/^fig(?:ure)?\.?\s*\d+(?:\.\d+)*(?:[a-z])?\s*[.:–—-]?\s*/i, "").trim();
          return <figure key={figure.id}>
            <img loading="lazy" className="h-auto max-w-full rounded" alt={figure.description || figure.labels.join(", ") || "Document figure"}
              src={`/api/student-document-figure?assignmentId=${encodeURIComponent(group.assignmentId)}&submissionId=${encodeURIComponent(group.submissionId)}&documentId=${encodeURIComponent(group.documentId)}&figureId=${encodeURIComponent(figure.id)}&versionPath=${encodeURIComponent(group.versionPath)}`} />
            <figcaption className="mt-1 text-xs text-muted-foreground">Page {figure.pageNumber}{caption ? ` · ${caption}` : ""}</figcaption>
          </figure>;
        })}
      </div>}
    </div>
  );
}
