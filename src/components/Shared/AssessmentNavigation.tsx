"use client";

import { Button } from "@/components/ui/button";

interface AssessmentNavigationProps {
  isFirstQuestion: boolean;
  isLastQuestion: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
}

export function AssessmentNavigation({
  isFirstQuestion,
  isLastQuestion,
  onPrevious,
  onNext,
  previousDisabled = false,
  nextDisabled = false,
}: AssessmentNavigationProps) {
  return (
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
          <Button onClick={onNext} disabled={nextDisabled} size="lg">
            Finish
          </Button>
        )}
      </div>
    </div>
  );
}




