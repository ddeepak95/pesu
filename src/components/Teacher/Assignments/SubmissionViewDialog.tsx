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
  getSubmissionById,
} from "@/lib/queries/submissions";
import {
  Submission,
  QuestionEvaluations,
  SubmissionAttempt,
  SubmissionFile,
} from "@/types/submission";
import { Assignment } from "@/types/assignment";
import { getAssignmentByIdForTeacher } from "@/lib/queries/assignments";
import {
  getSubmissionFiles,
  getFileDownloadUrl,
} from "@/lib/queries/submissionFiles";
import { showErrorToast } from "@/lib/toast";
import { useState, useEffect } from "react";
import { FileText, Loader2 } from "lucide-react";
import { SubmissionQuestionCard } from "./SubmissionQuestionCard";
import { TranscriptDialog } from "./TranscriptDialog";
import { SubmissionDisplayName } from "./SubmissionDisplayName";
import { SubmissionIntegrityLockBanner } from "@/components/Shared/Integrity/SubmissionIntegrityLockBanner";

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
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [fullSubmission, setFullSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transcriptDialogOpen, setTranscriptDialogOpen] = useState(false);
  const [selectedAttempt, setSelectedAttempt] =
    useState<SubmissionAttempt | null>(null);
  const [selectedQuestionOrder, setSelectedQuestionOrder] = useState<
    number | null
  >(null);
  const [submissionFiles, setSubmissionFiles] = useState<SubmissionFile[]>(
    [],
  );
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);

  // Get submission from either type (list view -- may not include evaluations JSONB)
  const submission =
    "student" in studentSubmission
      ? studentSubmission.submission
      : studentSubmission.submission;

  useEffect(() => {
    if (!open) {
      setSubmissionFiles([]);
    }
  }, [open]);

  useEffect(() => {
    if (open && submission) {
      const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
          const [assignmentData, submissionData, filesData] =
            await Promise.all([
              getAssignmentByIdForTeacher(submission.assignment_id),
              getSubmissionById(submission.submission_id),
              getSubmissionFiles(submission.submission_id),
            ]);
          setAssignment(assignmentData);
          setFullSubmission(submissionData);
          setSubmissionFiles(filesData);
        } catch (err) {
          console.error("Error fetching submission details:", err);
          setError("Failed to load submission details");
          setSubmissionFiles([]);
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }
  }, [open, submission]);

  const handleOpenSubmissionFile = async (file: SubmissionFile) => {
    if (openingFileId === file.id) return;
    setOpeningFileId(file.id);
    try {
      const url = await getFileDownloadUrl(file.id, "original");
      window.open(url, "_blank");
    } catch (err) {
      console.error("Open file error:", err);
      showErrorToast("Failed to get download link");
    } finally {
      setOpeningFileId(null);
    }
  };

  const handleViewTranscript = (
    attempt: SubmissionAttempt,
    questionOrder: number,
  ) => {
    setSelectedAttempt(attempt);
    setSelectedQuestionOrder(questionOrder);
    setTranscriptDialogOpen(true);
  };

  const getSubmissionEvaluations = (submission: Submission) => {
    if (!submission.evaluations) return {};

    // Check if it's the new format
    if (Array.isArray(submission.evaluations)) {
      // Legacy format - convert to new format structure for display
      return {};
    }

    // Handle both string and number keys (PostgreSQL JSONB may stringify keys)
    return submission.evaluations as {
      [key: number | string]: QuestionEvaluations;
    };
  };

  if (!submission) {
    return null;
  }
  // Use the full submission (fetched with evaluations JSONB) for displaying attempts
  const evaluations = fullSubmission
    ? getSubmissionEvaluations(fullSubmission)
    : {};


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
                  const s = await getSubmissionById(
                    fullSubmission.submission_id,
                  );
                  setFullSubmission(s);
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
            {/* Attempts by Question */}
            {assignment && (
              <div className="space-y-6">
                {assignment.questions
                  .sort((a, b) => a.order - b.order)
                  .map((question) => {
                    // Handle both string and number keys (PostgreSQL JSONB may stringify keys)
                    const questionEvals =
                      (evaluations[question.order] as
                        | QuestionEvaluations
                        | undefined) ||
                      (evaluations[String(question.order)] as
                        | QuestionEvaluations
                        | undefined);

                    return (
                      <SubmissionQuestionCard
                        key={question.order}
                        questionOrder={question.order}
                        questionPrompt={question.prompt}
                        questionAnswers={questionEvals}
                        submissionId={submission.submission_id}
                        onViewTranscript={handleViewTranscript}
                      />
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </DialogContent>

      {/* Transcript Dialog */}
      <TranscriptDialog
        open={transcriptDialogOpen}
        onOpenChange={setTranscriptDialogOpen}
        attempt={selectedAttempt}
        questionOrder={selectedQuestionOrder}
        submissionId={submission?.submission_id}
      />
    </Dialog>
  );
}
