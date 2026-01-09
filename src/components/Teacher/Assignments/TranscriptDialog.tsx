"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SubmissionAttempt } from "@/types/submission";

interface TranscriptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attempt: SubmissionAttempt | null;
  questionOrder: number | null;
}

export function TranscriptDialog({
  open,
  onOpenChange,
  attempt,
  questionOrder,
}: TranscriptDialogProps) {
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
          <pre className="text-sm whitespace-pre-wrap font-sans">
            {attempt.answer_text}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}
