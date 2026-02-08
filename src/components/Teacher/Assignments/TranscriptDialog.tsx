"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SubmissionAttempt } from "@/types/submission";
import { getTranscript } from "@/lib/queries/submissions";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

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
  const [transcriptText, setTranscriptText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && submissionId && attempt && questionOrder !== null) {
      setLoading(true);
      setTranscriptText(null);
      getTranscript(submissionId, questionOrder, attempt.attempt_number)
        .then((text) => setTranscriptText(text))
        .catch((err) => {
          console.error("Error loading transcript:", err);
          setTranscriptText(null);
        })
        .finally(() => setLoading(false));
    }
  }, [open, submissionId, attempt, questionOrder]);

  if (!attempt || questionOrder === null) {
    return null;
  }

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
