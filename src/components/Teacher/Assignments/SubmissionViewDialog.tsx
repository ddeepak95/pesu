"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  StudentSubmissionStatus,
  PublicSubmissionStatus,
} from "@/lib/queries/submissions";
import { SubmissionFile } from "@/types/submission";
import { requestFileDownloadUrl } from "@/lib/queries/submissionFiles";
import { showErrorToast } from "@/lib/toast";
import { useState, useMemo } from "react";
import { FileText, Info, Loader2 } from "lucide-react";
import { SubmissionGradingPanel } from "./SubmissionGradingPanel";
import { SubmissionDisplayName } from "./SubmissionDisplayName";
import { SubmissionIntegrityLockBanner } from "@/components/Shared/Integrity/SubmissionIntegrityLockBanner";
import {
  invalidateSubmissionByIdCache,
  useAssignmentByIdForTeacher,
  useSubmissionById,
  useSubmissionFiles,
} from "@/hooks/swr";

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

interface SubmissionViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentSubmission: StudentSubmissionStatus | PublicSubmissionStatus;
  /** Refetch list views after teacher clears integrity lock */
  onIntegrityRestored?: () => void | Promise<void>;
}

export default function SubmissionViewDialog({
  open,
  onOpenChange,
  studentSubmission,
  onIntegrityRestored,
}: SubmissionViewDialogProps) {
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [attemptNumber, setAttemptNumber] = useState<number | null>(null);

  const submission = studentSubmission.submission;

  const fetchKey = open && submission ? submission.submission_id : null;
  const assignmentKey = open && submission ? submission.assignment_id : null;

  const assignmentQuery = useAssignmentByIdForTeacher(assignmentKey);
  const fullSubmissionQuery = useSubmissionById(fetchKey);
  const submissionFilesQuery = useSubmissionFiles(fetchKey);

  const assignment = assignmentQuery.data ?? null;
  const fullSubmission = fullSubmissionQuery.data ?? null;
  const submissionFiles: SubmissionFile[] = useMemo(
    () => submissionFilesQuery.data ?? [],
    [submissionFilesQuery.data]
  );

  const loading =
    open &&
    (assignmentQuery.isLoading ||
      fullSubmissionQuery.isLoading ||
      submissionFilesQuery.isLoading);
  const error =
    assignmentQuery.error ||
    fullSubmissionQuery.error ||
    submissionFilesQuery.error
      ? "Failed to load submission details"
      : null;

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

  if (!submission) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <SubmissionDisplayName submission={studentSubmission} />
          </DialogTitle>
          <DialogDescription>Submission Details</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              Loading submission details...
            </p>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-destructive">{error}</p>
          </div>
        ) : (
          <div className="space-y-6 mt-4">
            {fullSubmission?.integrity_access_revoked_at ? (
              <SubmissionIntegrityLockBanner
                submissionId={fullSubmission.submission_id}
                revokedAt={fullSubmission.integrity_access_revoked_at}
                reasonCode={fullSubmission.integrity_access_revoked_reason}
                onRestored={async () => {
                  await invalidateSubmissionByIdCache();
                  await onIntegrityRestored?.();
                }}
              />
            ) : null}
            {submissionFiles.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Submitted files
                </h3>
                <ul className="space-y-2">
                  {submissionFiles.map((file) => {
                    const statusLabel =
                      FILE_STATUS_LABEL[file.processing_status] ??
                      file.processing_status;
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
                          {isOpening ? (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            {assignment?.dynamic_questions_enabled &&
              fullSubmission?.generated_questions && (
                <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3">
                  <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Questions were generated dynamically based on this
                    student&apos;s file submission.
                  </p>
                </div>
              )}

            <SubmissionGradingPanel
              submissionId={submission.submission_id}
              assignmentId={submission.assignment_id}
              selectedQuestionIndex={questionIndex}
              onQuestionChange={setQuestionIndex}
              selectedAttemptNumber={attemptNumber}
              onAttemptChange={setAttemptNumber}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
