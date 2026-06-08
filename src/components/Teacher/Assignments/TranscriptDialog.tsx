"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SubmissionAttempt } from "@/types/submission";
import { Loader2 } from "lucide-react";
import {
  useChatMessageActions,
  useChatMessages,
  useVoiceMessagesForAttempt,
} from "@/hooks/swr";
import { ContentBox } from "@/components/Shared/KonvoVoice/ContentBox";
import type { PendingAction } from "@/components/Shared/KonvoVoice/actionTypes";
import type { VoiceMessageRow } from "@/lib/queries/voiceMessages";

interface TranscriptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attempt: SubmissionAttempt | null;
  questionOrder: number | null;
  submissionId?: string;
}

export function TranscriptDialog({
  open,
  onOpenChange,
  attempt,
  questionOrder,
  submissionId,
}: TranscriptDialogProps) {
  const chatMessagesQuery = useChatMessages({
    submissionId: open ? (submissionId ?? null) : null,
    questionOrder: open ? questionOrder : null,
    attemptNumber: open && attempt ? attempt.attempt_number : null,
  });

  const messages = useMemo(
    () => chatMessagesQuery.data ?? [],
    [chatMessagesQuery.data],
  );
  const messageIds = useMemo(() => messages.map((m) => m.id), [messages]);

  const actionsQuery = useChatMessageActions(messageIds);

  const voiceQuery = useVoiceMessagesForAttempt({
    submissionId: open ? (submissionId ?? null) : null,
    questionOrder: open ? questionOrder : null,
    attemptNumber: open && attempt ? attempt.attempt_number : null,
  });

  const audioUrlMap = useMemo(() => {
    const map = new Map<string, string>();
    const byRole: Record<string, VoiceMessageRow[]> = {};
    for (const v of voiceQuery.data ?? []) {
      (byRole[v.role] ??= []).push(v);
    }
    const roleCounters: Record<string, number> = {};
    for (const m of messages) {
      const idx = roleCounters[m.role] ?? 0;
      const url = byRole[m.role]?.[idx]?.audio_file_url;
      if (url) map.set(m.id, url);
      roleCounters[m.role] = idx + 1;
    }
    return map;
  }, [voiceQuery.data, messages]);

  const mergedMessages = useMemo(() => {
    const result: Array<
      (typeof messages)[number] & { action?: PendingAction }
    > = [];
    for (const m of messages) {
      const action = actionsQuery.data?.[m.id];
      if (action && m.content) {
        // DB stores the action on the same message as the text. Split into two
        // items to match the live-view structure ContentBox expects.
        result.push({ ...m, action: undefined });
        result.push({ ...m, id: `${m.id}-action`, content: "", action });
      } else {
        result.push({ ...m, action });
      }
    }
    return result;
  }, [messages, actionsQuery.data]);

  const expandedMessageIds = useMemo(
    () => Object.fromEntries(messages.map((m) => [m.id, true])),
    [messages],
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);

  const handleReplayAudio = useCallback(
    (messageId: string) => {
      const url = audioUrlMap.get(messageId);
      if (!url) return;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (playingMessageId === messageId) {
        setPlayingMessageId(null);
        return;
      }
      const audio = new Audio(url);
      audio.onended = () => setPlayingMessageId(null);
      audioRef.current = audio;
      audio.play();
      setPlayingMessageId(messageId);
    },
    [audioUrlMap, playingMessageId],
  );

  if (!attempt || questionOrder === null) {
    return null;
  }

  const loading = chatMessagesQuery.isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Transcript - Question {questionOrder}, Attempt{" "}
            {attempt.attempt_number}
          </DialogTitle>
          <DialogDescription>
            View the conversation for this attempt
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm text-muted-foreground">
                Loading conversation...
              </span>
            </div>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No conversation recorded for this attempt.
            </p>
          ) : (
            <ContentBox
              content={null}
              messages={mergedMessages}
              expandedMessageIds={expandedMessageIds}
              audioAvailableIds={new Set(audioUrlMap.keys())}
              onReplayAudio={handleReplayAudio}
              playingMessageId={playingMessageId}
              readOnly={true}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
