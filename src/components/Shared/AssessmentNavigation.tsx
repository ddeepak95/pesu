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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Star } from "lucide-react";
import { markContentAsComplete } from "@/lib/queries/contentCompletions";
import { saveExperienceRating } from "@/lib/queries/submissions";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

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

export function AssessmentNavigation({
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
  totalQuestions = 0,
  onMarkedComplete,
  isComplete = false,
  submissionId,
  experienceRatingEnabled = false,
  experienceRatingRequired = false,
  onClose,
}: AssessmentNavigationProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
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

  const handleFinishClick = () => {
    if (isComplete) {
      showSuccessToast("This assessment is already completed.");
      if (onNext) onNext();
      return;
    }

    // Validate if require_all_attempts is enabled
    if (requireAllAttempts && !allQuestionsHaveAttempts) {
      const attemptedCount = questionsWithAttempts?.size ?? 0;
      showErrorToast(
        `Please attempt all questions for this assessment to be marked as complete. You have attempted ${attemptedCount} of ${totalQuestions} questions.`,
      );
      return;
    }

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

      await markContentAsComplete(contentItemId);
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
            <Button
              onClick={handleFinishClick}
              disabled={nextDisabled}
              size="lg"
            >
              {isComplete
                ? "Already Completed"
                : contentItemId
                  ? "Finish & Mark Complete"
                  : "Finish"}
            </Button>
          )}
        </div>
      </div>

      {onClose && (
        <div className="mt-6 flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      )}

      {/* Dialog 1: Confirmation */}
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
}
