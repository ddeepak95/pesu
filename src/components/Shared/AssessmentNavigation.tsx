"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { markContentAsComplete } from "@/lib/queries/contentCompletions";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

interface AssessmentNavigationProps {
  isFirstQuestion: boolean;
  isLastQuestion: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  contentItemId?: string | null;
}

export function AssessmentNavigation({
  isFirstQuestion,
  isLastQuestion,
  onPrevious,
  onNext,
  previousDisabled = false,
  nextDisabled = false,
  contentItemId,
}: AssessmentNavigationProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleFinishClick = () => {
    if (contentItemId) {
      // Show confirmation dialog
      setIsDialogOpen(true);
    } else {
      // No content item ID, just call onNext
      if (onNext) onNext();
    }
  };

  const handleConfirmFinish = async () => {
    if (!contentItemId) {
      if (onNext) onNext();
      return;
    }

    setIsLoading(true);
    try {
      await markContentAsComplete(contentItemId);
      showSuccessToast("Assessment marked as complete!");
      setIsDialogOpen(false);
      if (onNext) onNext();
    } catch (error) {
      console.error("Error marking assessment as complete:", error);
      showErrorToast("Failed to mark as complete. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="flex justify-between gap-4">
        <Button
          onClick={onPrevious}
          disabled={isFirstQuestion || previousDisabled}
          variant="outline"
          size="lg"
        >
          Previous Question
        </Button>

        <div className="flex gap-4">
          {!isLastQuestion && (
            <Button onClick={onNext} disabled={nextDisabled} size="lg">
              Next Question
            </Button>
          )}
          {isLastQuestion && (
            <Button onClick={handleFinishClick} disabled={nextDisabled} size="lg">
              {contentItemId ? "Finish & Mark Complete" : "Finish"}
            </Button>
          )}
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finish Assessment</DialogTitle>
            <DialogDescription>
              Are you sure you want to finish and mark this assessment as complete?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmFinish} disabled={isLoading}>
              {isLoading ? "Saving..." : "Yes, Finish & Mark Complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}




