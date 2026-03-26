"use client";

import { useState, forwardRef, useImperativeHandle, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Star } from "lucide-react";
import { markContentAsComplete } from "@/lib/queries/contentCompletions";
import { invalidateCompletionsCache } from "@/hooks/swr";
import {
  saveExperienceRating,
  completeSubmission,
} from "@/lib/queries/submissions";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { FinishAssessmentButton } from "@/components/Shared/FinishAssessmentButton";
import { QuestionsStatusDialog } from "@/components/Shared/QuestionsStatusDialog";

interface AssessmentNavigationProps {
  isFirstQuestion: boolean;
  isLastQuestion: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  contentItemId?: string | null;
  // Attempt validation props
  requireAllAttempts?: boolean;
  allQuestionsHaveAttempts?: boolean;
  questionsWithAttempts?: Set<number>;
  completedQuestionIndices?: number[];
  onGoToQuestion?: (index: number) => void;
  totalQuestions?: number;
  onMarkedComplete?: () => void;
  isComplete?: boolean;
  // Experience rating props
  submissionId?: string;
  experienceRatingEnabled?: boolean;
  experienceRatingRequired?: boolean;
  // Close button
  onClose?: () => void;
}

export interface AssessmentNavigationHandle {
  triggerFinish: () => void;
}

export const AssessmentNavigation = forwardRef<
  AssessmentNavigationHandle,
  AssessmentNavigationProps
>(function AssessmentNavigation(
  {
    isFirstQuestion,
    isLastQuestion,
    onPrevious,
    onNext,
    previousDisabled = false,
    nextDisabled = false,
    contentItemId,
    requireAllAttempts = false,
    allQuestionsHaveAttempts = true,
    questionsWithAttempts,
    completedQuestionIndices,
    onGoToQuestion,
    totalQuestions = 0,
    onMarkedComplete,
    isComplete = false,
    submissionId,
    experienceRatingEnabled = false,
    experienceRatingRequired = false,
    onClose,
  },
  ref,
) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isQuestionsStatusDialogOpen, setIsQuestionsStatusDialogOpen] =
    useState(false);
  const [isRatingDialogOpen, setIsRatingDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Experience rating state
  const [rating, setRating] = useState<number | null>(null);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [ratingFeedback, setRatingFeedback] = useState("");

  const resetRatingState = () => {
    setRating(null);
    setHoveredRating(null);
    setRatingFeedback("");
  };

  const handleFinishClick = useCallback(() => {
    if (isComplete) {
      showSuccessToast("This assessment is already completed.");
      if (onNext) onNext();
      return;
    }

    // All questions attempted: go to completion (confirmation dialog or finish)
    if (allQuestionsHaveAttempts) {
      if (contentItemId) {
        setIsDialogOpen(true);
      } else {
        if (onNext) onNext();
      }
      return;
    }

    // Not all attempted: show questions-status dialog so user can go to missing questions
    const canShowQuestionsStatus =
      totalQuestions > 0 &&
      onGoToQuestion != null &&
      completedQuestionIndices != null;
    if (canShowQuestionsStatus) {
      setIsQuestionsStatusDialogOpen(true);
      return;
    }

    // Fallback when dialog props not provided
    if (requireAllAttempts) {
      const attemptedCount = questionsWithAttempts?.size ?? 0;
      showErrorToast(
        `Please attempt all questions for this assessment to be marked as complete. You have attempted ${attemptedCount} of ${totalQuestions} questions.`,
      );
      return;
    }

    if (contentItemId) {
      setIsDialogOpen(true);
    } else {
      if (onNext) onNext();
    }
  }, [
    isComplete,
    onNext,
    allQuestionsHaveAttempts,
    contentItemId,
    totalQuestions,
    onGoToQuestion,
    completedQuestionIndices,
    requireAllAttempts,
    questionsWithAttempts,
  ]);

  useImperativeHandle(
    ref,
    () => ({ triggerFinish: () => handleFinishClick() }),
    [handleFinishClick],
  );


  const handleConfirmFinish = async () => {
    if (!contentItemId) {
      if (onNext) onNext();
      return;
    }

    if (isComplete) {
      if (onNext) onNext();
      return;
    }

    // If experience rating is enabled, close this dialog and open the rating dialog
    if (experienceRatingEnabled && submissionId) {
      setIsDialogOpen(false);
      resetRatingState();
      setIsRatingDialogOpen(true);
      return;
    }

    // Otherwise, proceed directly with marking complete
    await performCompletion();
  };

  const performCompletion = async (
    experienceRating?: number,
    feedback?: string,
  ) => {
    if (!contentItemId) return;

    setIsLoading(true);
    try {
      // Save experience rating if provided
      if (experienceRating && submissionId) {
        await saveExperienceRating(submissionId, experienceRating, feedback);
      }

      if (submissionId) {
        await completeSubmission(submissionId);
      }
      await markContentAsComplete(contentItemId);
      await invalidateCompletionsCache();
      showSuccessToast("Assessment marked as complete!");
      setIsDialogOpen(false);
      setIsRatingDialogOpen(false);
      resetRatingState();
      if (onMarkedComplete) {
        onMarkedComplete();
      }
      if (onNext) onNext();
    } catch (error) {
      console.error("Error marking assessment as complete:", error);
      showErrorToast("Failed to mark as complete. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitRating = async () => {
    if (!rating) return;
    await performCompletion(rating, ratingFeedback);
  };

  const handleSkipRating = async () => {
    await performCompletion();
  };

  const displayRating = hoveredRating ?? rating;

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
        {/* Next/Finish first on mobile (order-1), right on desktop (order-2) */}
        <div className="order-1 flex gap-4 sm:order-2">
          {!isLastQuestion && (
            <Button
              variant="outline"
              onClick={onNext}
              disabled={nextDisabled}
              size="lg"
              className="w-full sm:w-auto"
            >
              Next
            </Button>
          )}
          {isLastQuestion && (
            <FinishAssessmentButton
              onFinish={handleFinishClick}
              disabled={nextDisabled}
              variant="outline"
              size="lg"
              className="w-full sm:w-auto"
              isComplete={isComplete}
              contentItemId={contentItemId}
            />
          )}
        </div>
        {/* Previous second on mobile (order-2), left on desktop (order-1) */}
        <Button
          onClick={onPrevious}
          disabled={isFirstQuestion || previousDisabled}
          variant="outline"
          size="lg"
          className="order-2 w-full sm:order-1 sm:w-auto"
        >
          Previous
        </Button>
      </div>

      {onClose && (
        <div className="mt-6 flex justify-center">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      )}

      <QuestionsStatusDialog
        open={isQuestionsStatusDialogOpen}
        onOpenChange={setIsQuestionsStatusDialogOpen}
        totalQuestions={totalQuestions}
        completedQuestionIndices={completedQuestionIndices ?? []}
        onGoToQuestion={(index) => onGoToQuestion?.(index)}
      />

      {/* Dialog: Confirmation */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finish Assessment</DialogTitle>
            <DialogDescription>
              Are you sure you want to finish and mark this assessment as
              complete?
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

      {/* Dialog 2: Experience Rating */}
      <Dialog
        open={isRatingDialogOpen}
        onOpenChange={(open) => {
          if (!open && !experienceRatingRequired) {
            setIsRatingDialogOpen(false);
            resetRatingState();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rate Your Experience</DialogTitle>
            <DialogDescription>
              How would you rate your experience with this activity?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Star Rating */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoveredRating(star)}
                    onMouseLeave={() => setHoveredRating(null)}
                    className="p-1 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    aria-label={`Rate ${star} out of 5`}
                  >
                    <Star
                      className={`w-8 h-8 transition-colors ${
                        displayRating && star <= displayRating
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-muted-foreground/40"
                      }`}
                    />
                  </button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground h-5">
                {displayRating ? `${displayRating} out of 5` : "\u00A0"}
              </p>
            </div>

            {/* Optional Feedback */}
            <div className="space-y-2">
              <Label htmlFor="ratingFeedback" className="text-sm">
                Why did you give this rating? (optional)
              </Label>
              <Textarea
                id="ratingFeedback"
                value={ratingFeedback}
                onChange={(e) => setRatingFeedback(e.target.value)}
                placeholder="Share your thoughts..."
                rows={3}
                disabled={isLoading}
              />
            </div>
          </div>

          <DialogFooter className="flex-row gap-2 sm:justify-between">
            {!experienceRatingRequired && (
              <Button
                variant="ghost"
                onClick={handleSkipRating}
                disabled={isLoading}
                className="mr-auto"
              >
                Skip
              </Button>
            )}
            <Button
              onClick={handleSubmitRating}
              disabled={isLoading || !rating}
            >
              {isLoading ? "Saving..." : "Submit Rating"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});
