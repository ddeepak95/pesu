"use client";

import React from "react";
import { Check, Loader2, X } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { cn } from "@/lib/utils";
import type { ActionKind, McqActionPayload } from "@/lib/multimodal/actions/types";
import type { PendingAction } from "./actionTypes";

// Inline markdown: paragraphs are unwrapped so MCQ question/choice text flows
// within its surrounding element (e.g. inside the choice button).
const inlineMarkdownComponents: Components = {
  p: ({ children }) => <>{children}</>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ children, ...props }) => (
    <a
      className="text-primary underline underline-offset-4"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 text-[0.85em] font-mono">
      {children}
    </code>
  ),
  ul: ({ children }) => <ul className="list-disc pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5">{children}</ol>,
};

function Markdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <span className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={inlineMarkdownComponents}
      >
        {content}
      </ReactMarkdown>
    </span>
  );
}

function ActionSkeleton({ kind }: { kind: ActionKind }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        <span>
          {kind === "mcq" ? "Preparing a question…" : "Preparing content…"}
        </span>
      </div>
      <div className="mt-3 space-y-2" aria-hidden>
        <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
        <div className="h-8 rounded bg-muted/70 animate-pulse" />
        <div className="h-8 rounded bg-muted/70 animate-pulse" />
      </div>
    </div>
  );
}

interface MCQCardProps {
  payload: McqActionPayload;
  answeredIndex?: number;
  onAnswer?: (index: number) => void;
}

function MCQCard({ payload, answeredIndex, onAnswer }: MCQCardProps) {
  const answered = answeredIndex !== undefined;

  return (
    <div
      className="rounded-xl border border-border/60 bg-background/70 p-3"
      role="group"
      aria-label="Multiple choice question"
    >
      <Markdown
        content={payload.question}
        className="text-sm font-medium text-foreground"
      />
      <ul className="mt-2 space-y-1.5" role="radiogroup" aria-label={payload.question}>
        {payload.choices.map((choice, index) => {
          const isPicked = index === answeredIndex;
          // Only the learner's own pick is marked — the correct answer is never
          // revealed on the card (the tutor explains verbally).
          const pickedCorrect = isPicked && index === payload.correctIndex;
          const pickedWrong = isPicked && index !== payload.correctIndex;

          return (
            <li key={index}>
              <button
                type="button"
                role="radio"
                aria-checked={isPicked}
                disabled={answered}
                onClick={answered ? undefined : () => onAnswer?.(index)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  "border-border/60 bg-muted/40",
                  !answered && "hover:bg-muted/80 cursor-pointer",
                  answered && "cursor-default",
                  pickedCorrect && "border-green-500/60 bg-green-500/10 text-foreground",
                  pickedWrong && "border-destructive/60 bg-destructive/10 text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs",
                    pickedCorrect && "border-green-500/60 text-green-600 dark:text-green-400",
                    pickedWrong && "border-destructive/60 text-destructive",
                    !pickedCorrect && !pickedWrong && "border-border/60 text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {pickedCorrect ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : pickedWrong ? (
                    <X className="h-3.5 w-3.5" />
                  ) : (
                    String.fromCharCode(65 + index)
                  )}
                </span>
                <Markdown content={choice} className="min-w-0" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface ActionCardProps {
  action: PendingAction;
  /** Called with the chosen choice index when the learner answers an MCQ. */
  onMcqAnswer?: (index: number) => void;
}

/**
 * Renders a standalone action message (its own bubble-less message in the
 * scroll history, which may appear while the agent is still speaking).
 * Extensible — future action kinds add a case here.
 */
export function ActionCard({ action, onMcqAnswer }: ActionCardProps) {
  if (action.state === "loading") return <ActionSkeleton kind={action.kind} />;
  if (action.state !== "ready" || !action.payload) return null;

  switch (action.payload.kind) {
    case "mcq":
      return (
        <MCQCard
          payload={action.payload}
          answeredIndex={action.answeredIndex}
          onAnswer={
            action.answeredIndex === undefined ? onMcqAnswer : undefined
          }
        />
      );
    default:
      return null;
  }
}
