"use client";

import { Loader2 } from "lucide-react";
import type { ActionKind } from "@/lib/multimodal/actions/types";
import type { PendingAction } from "./actionTypes";
import { DisplayContentCard } from "./cards/DisplayContentCard";
import { MCQCard } from "./cards/McqCard";
import { SuggestedResponseCard } from "./cards/SuggestedResponseCard";
import { RetryErrorCard } from "@/components/ui/retry-error-card";
import {
  userFacingAiHint,
  userFacingAiMessage,
} from "@/lib/ai/errorMessages";

export interface TtsConfig {
  ttsModelId: string;
  assignmentId: string;
  language: string;
}

function ActionSkeleton({ kind }: { kind: ActionKind }) {
  const label =
    kind === "mcq"
      ? "Preparing a question…"
      : kind === "suggested_response"
        ? "Preparing a suggested response…"
        : kind === "display_content"
          ? "Loading content…"
          : "Preparing content…";
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        <span>{label}</span>
      </div>
      <div className="mt-3 space-y-2" aria-hidden>
        <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
        <div className="h-8 rounded bg-muted/70 animate-pulse" />
        <div className="h-8 rounded bg-muted/70 animate-pulse" />
      </div>
    </div>
  );
}

interface ActionCardProps {
  action: PendingAction;
  /** Called with the chosen choice index when the learner answers an MCQ. */
  onMcqAnswer?: (index: number) => void;
  /** TTS config for cards that play audio (e.g. suggested_response). */
  ttsConfig?: TtsConfig;
  /** Retry generation for an error-state card. */
  onRetry?: () => void;
  /** Disables the retry button while another turn/retry is in flight. */
  retryDisabled?: boolean;
}

/**
 * Renders a standalone action message. Each action kind has its own card
 * component under `./cards/`. To add a new kind: create `cards/<kind>Card.tsx`
 * and add a case in the switch below.
 */
export function ActionCard({
  action,
  onMcqAnswer,
  ttsConfig,
  onRetry,
  retryDisabled,
}: ActionCardProps) {
  if (action.state === "loading") return <ActionSkeleton kind={action.kind} />;
  if (action.state === "error") {
    return (
      <RetryErrorCard
        variant="block"
        message={userFacingAiMessage(action.error?.code)}
        detail={
          action.error
            ? userFacingAiHint(action.error.code)
            : "Please try again."
        }
        retryable={action.error?.retryable ?? true}
        onRetry={onRetry}
        disabled={retryDisabled}
        countdownMs={action.error?.retryAfterMs}
      />
    );
  }
  if (action.state !== "ready" || !action.payload) return null;

  switch (action.payload.kind) {
    case "mcq":
      return (
        <MCQCard
          payload={action.payload}
          answeredIndex={action.answeredIndex}
          onAnswer={action.answeredIndex === undefined ? onMcqAnswer : undefined}
        />
      );
    case "suggested_response":
      return <SuggestedResponseCard payload={action.payload} ttsConfig={ttsConfig} />;
    case "display_content":
    // Legacy kind, pre-rename — still present in historical chat_message_actions
    // rows. Render with the same card until old rows age out.
    case "display_markdown":
      return <DisplayContentCard payload={action.payload} />;
    default:
      return null;
  }
}
