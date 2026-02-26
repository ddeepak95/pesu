"use client";

import { Button } from "@/components/ui/button";
import { type ButtonProps } from "@/components/ui/button";

function getLabel(isComplete: boolean, contentItemId?: string | null): string {
  if (isComplete) return "Already Completed";
  if (contentItemId) return "Finish & Mark Complete";
  return "Finish";
}

export interface FinishAssessmentButtonProps
  extends Omit<ButtonProps, "onClick" | "children"> {
  isComplete?: boolean;
  contentItemId?: string | null;
  onFinish: () => void;
}

/**
 * Shared "Finish" button for the last question in an assessment.
 * Used by AssessmentNavigation (below the card) and QuestionCompletionPanel (inside the card).
 * Single source for label and behavior; callers pass their own onFinish handler.
 */
export function FinishAssessmentButton({
  isComplete = false,
  contentItemId,
  onFinish,
  disabled,
  variant = "default",
  size = "lg",
  className,
  ...rest
}: FinishAssessmentButtonProps) {
  return (
    <Button
      onClick={onFinish}
      disabled={disabled}
      variant={variant}
      size={size}
      className={className}
      {...rest}
    >
      {getLabel(isComplete, contentItemId)}
    </Button>
  );
}
