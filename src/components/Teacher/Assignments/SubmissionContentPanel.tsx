"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SubmissionIntegrityLockBanner } from "@/components/Shared/Integrity/SubmissionIntegrityLockBanner";
import { ContentBox } from "@/components/Shared/KonvoVoice/ContentBox";
import {
  invalidateSubmissionByIdCache,
  useAssignmentByIdForTeacher,
  useChatMessageActions,
  useChatMessages,
  useSubmissionById,
  useSubmissionFiles,
  useVoiceMessagesForAttempt,
} from "@/hooks/swr";
import { requestFileDownloadUrl } from "@/lib/queries/submissionFiles";
import { showErrorToast } from "@/lib/toast";
import { SubmissionFile } from "@/types/submission";
import type { PendingAction } from "@/components/Shared/KonvoVoice/actionTypes";
import type { VoiceMessageRow } from "@/lib/queries/voiceMessages";

const FILE_STATUS_LABEL: Record<string, string> = {
  uploading: "Uploading…",
  uploaded: "Uploaded",
  processing: "Processing…",
  processed: "Ready",
  failed: "Failed",
};

function truncateFilename(name: string, max = 48): string {
  if (name.length <= max) return name;
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  const base = ext ? name.slice(0, name.length - ext.length) : name;
  const keep = max - ext.length - 3;
  return `${base.slice(0, Math.max(4, keep))}…${ext}`;
}

function SkeletonLine({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-muted ${className ?? "h-4 w-full"}`} />
  );
}

interface SubmissionContentPanelProps {
  submissionId: string;
  assignmentId: string;
  selectedQuestionIndex: number;
  selectedAttemptNumber: number | null;
  onIntegrityRestored?: () => void;
}

export function SubmissionContentPanel({
  submissionId,
  assignmentId,
  selectedQuestionIndex,
  selectedAttemptNumber,
  onIntegrityRestored,
}: SubmissionContentPanelProps) {
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);

  const assignmentQuery = useAssignmentByIdForTeacher(assignmentId);
  const fullSubmissionQuery = useSubmissionById(submissionId);
  const submissionFilesQuery = useSubmissionFiles(submissionId);

  const assignment = assignmentQuery.data ?? null;
  const fullSubmission = fullSubmissionQuery.data ?? null;
  const submissionFiles: SubmissionFile[] = useMemo(
    () => submissionFilesQuery.data ?? [],
    [submissionFilesQuery.data]
  );

  const questions = useMemo(() => {
    if (!assignment) return [];
    if (assignment.dynamic_questions_enabled && fullSubmission?.generated_questions) {
      return [...fullSubmission.generated_questions].sort((a, b) => a.order - b.order);
    }
    return [...(assignment.questions ?? [])].sort((a, b) => a.order - b.order);
  }, [assignment, fullSubmission]);

  const currentQuestion = questions[selectedQuestionIndex] ?? null;
  const questionOrder = currentQuestion?.order ?? null;

  const hasFileSubmission = !!assignment?.file_submission_config;
  const showConversation = selectedAttemptNumber !== null && currentQuestion !== null;

  // Transcript data
  const chatMessagesQuery = useChatMessages({
    submissionId: showConversation ? submissionId : null,
    questionOrder: showConversation ? questionOrder : null,
    attemptNumber: selectedAttemptNumber,
  });

  const messages = useMemo(() => chatMessagesQuery.data ?? [], [chatMessagesQuery.data]);
  const messageIds = useMemo(() => messages.map((m) => m.id), [messages]);
  const actionsQuery = useChatMessageActions(messageIds);

  const voiceQuery = useVoiceMessagesForAttempt({
    submissionId: showConversation ? submissionId : null,
    questionOrder: showConversation ? questionOrder : null,
    attemptNumber: selectedAttemptNumber,
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
    const result: Array<(typeof messages)[number] & { action?: PendingAction }> = [];
    for (const m of messages) {
      const action = actionsQuery.data?.[m.id];
      if (action && m.content) {
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
    [messages]
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
    [audioUrlMap, playingMessageId]
  );

  const handleOpenSubmissionFile = async (file: SubmissionFile) => {
    if (openingFileId === file.id) return;
    setOpeningFileId(file.id);
    try {
      const url = await requestFileDownloadUrl(file.id, "original");
      window.open(url, "_blank");
    } catch (err) {
      console.error("Open file error:", err);
      showErrorToast("Failed to get download link");
    } finally {
      setOpeningFileId(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent">
      {/* Integrity banner — only when data available */}
      {fullSubmission?.integrity_access_revoked_at && (
        <div className="m-6 mb-0">
          <SubmissionIntegrityLockBanner
            submissionId={fullSubmission.submission_id}
            revokedAt={fullSubmission.integrity_access_revoked_at}
            reasonCode={fullSubmission.integrity_access_revoked_reason}
            onRestored={async () => {
              await invalidateSubmissionByIdCache();
              onIntegrityRestored?.();
            }}
          />
        </div>
      )}

      {/* Tabs render immediately; content loads progressively inside each tab */}
      <Tabs defaultValue="conversation" className="min-h-0 flex-1 flex flex-col">
        <TabsList className="h-auto w-full justify-start rounded-none border-b border-[var(--class-underline-tab-rule)] bg-transparent p-0">
          <TabsTrigger
            value="conversation"
            className="rounded-none border-b-2 border-transparent px-6 py-3 text-base font-medium data-[state=active]:!border-[var(--class-underline-tab-active-accent)] data-[state=active]:!bg-transparent data-[state=active]:!shadow-none"
          >
            Conversation
          </TabsTrigger>
          {/* Show File Submission tab: immediately if we know it exists, or show
              a placeholder tab while assignment loads (avoids layout shift) */}
          {(hasFileSubmission || assignmentQuery.isLoading) && (
            <TabsTrigger
              value="files"
              disabled={assignmentQuery.isLoading}
              className="rounded-none border-b-2 border-transparent px-6 py-3 text-base font-medium data-[state=active]:!border-[var(--class-underline-tab-active-accent)] data-[state=active]:!bg-transparent data-[state=active]:!shadow-none"
            >
              File Submission
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="conversation" className="mt-0 min-h-0 flex-1">
          {!showConversation ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Select a question on the right to view its conversation.
            </p>
          ) : chatMessagesQuery.isLoading ? (
            <div className="space-y-3 pt-2">
              <SkeletonLine className="h-16 w-3/4" />
              <SkeletonLine className="h-16 w-3/4 ml-auto" />
              <SkeletonLine className="h-16 w-3/4" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
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
              animateActions={false}
              autoScroll={false}
              className="h-full rounded-none border-0"
            />
          )}
        </TabsContent>

        {(hasFileSubmission || assignmentQuery.isLoading) && (
          <TabsContent value="files" className="mt-0 p-6">
            {submissionFilesQuery.isLoading ? (
              <div className="space-y-2 pt-2">
                <SkeletonLine className="h-12 w-full" />
                <SkeletonLine className="h-12 w-full" />
              </div>
            ) : submissionFiles.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No files submitted.
              </p>
            ) : (
              <ul className="space-y-2">
                {submissionFiles.map((file) => {
                  const statusLabel =
                    FILE_STATUS_LABEL[file.processing_status] ?? file.processing_status;
                  const isOpening = openingFileId === file.id;
                  return (
                    <li key={file.id}>
                      <button
                        type="button"
                        onClick={() => handleOpenSubmissionFile(file)}
                        disabled={isOpening}
                        className="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted/50 cursor-pointer disabled:cursor-wait disabled:opacity-80"
                      >
                        <FileText className="h-5 w-5 shrink-0 text-muted-foreground/60" />
                        <div className="min-w-0 flex-1">
                          <p
                            className="text-sm font-medium truncate"
                            title={file.filename}
                          >
                            {truncateFilename(file.filename)}
                          </p>
                          <p
                            className={`text-xs mt-0.5 ${
                              file.processing_status === "failed"
                                ? "text-destructive"
                                : "text-muted-foreground"
                            }`}
                          >
                            {statusLabel}
                          </p>
                        </div>
                        {isOpening && (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
