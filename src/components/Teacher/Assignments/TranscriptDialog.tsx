"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SubmissionAttempt } from "@/types/submission";
import { Loader2 } from "lucide-react";
import { useTranscript } from "@/hooks/swr";

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
  const transcriptQuery = useTranscript({
    submissionId: open ? submissionId ?? null : null,
    questionOrder: open ? questionOrder : null,
    attemptNumber: open && attempt ? attempt.attempt_number : null,
  });

  if (!attempt || questionOrder === null) {
    return null;
  }

  const loading = transcriptQuery.isLoading;
  const transcriptText = transcriptQuery.data ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Transcript - Question {questionOrder}, Attempt {attempt.attempt_number}
          </DialogTitle>
          <DialogDescription>
            View the transcript for this attempt
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 p-4 bg-muted/50 rounded-md">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm text-muted-foreground">Loading transcript...</span>
            </div>
          ) : transcriptText ? (
            <pre className="text-sm whitespace-pre-wrap font-sans">
              {transcriptText}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No transcript available for this attempt.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
