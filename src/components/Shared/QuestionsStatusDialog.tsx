"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2 } from "lucide-react";

export interface QuestionsStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalQuestions: number;
  completedQuestionIndices?: number[];
  onGoToQuestion: (index: number) => void;
}

/**
 * Dialog that lists all questions with completed/not completed status.
 * Used when the student clicks Finish and the assignment is not yet complete.
 * "Go to Question" navigates to that question and closes the dialog.
 */
export function QuestionsStatusDialog({
  open,
  onOpenChange,
  totalQuestions,
  completedQuestionIndices = [],
  onGoToQuestion,
}: QuestionsStatusDialogProps) {
  const handleGoToQuestion = (index: number) => {
    onGoToQuestion(index);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Incomplete Questions Found</DialogTitle>
          <DialogDescription>
            Finish all questions to mark the assessment as complete.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 py-2">
          {Array.from({ length: totalQuestions }, (_, index) => {
            const isCompleted = completedQuestionIndices.includes(index);
            return (
              <li
                key={index}
                className="flex items-center justify-between gap-4 rounded-md border p-3"
              >
                <span className="font-medium">Question {index + 1}</span>
                {isCompleted ? (
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CheckCircle2 className="size-4 text-green-500" />
                    Completed
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleGoToQuestion(index)}
                  >
                    Go to Question
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
