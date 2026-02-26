"use client";

import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SubmissionAttempt } from "@/types/submission";
import { StarRatingDisplay } from "@/components/StarRatingDisplay";
import { FinishAssessmentButton } from "@/components/Shared/FinishAssessmentButton";
import { AttemptFeedbackView } from "@/components/Shared/AttemptFeedbackView";
import { getScoreColor, getScoreBgColor } from "@/lib/utils/scoreDisplay";
import { CheckCircle2 } from "lucide-react";

interface QuestionCompletionPanelProps {
  attempt: SubmissionAttempt;
  useStarDisplay?: boolean;
  starScale?: number;
  onNext: () => void;
  onTryAgain: () => void;
  onFinish?: () => void;
  remainingAttempts: number | null;
  isLastQuestion: boolean;
  isComplete?: boolean;
  contentItemId?: string | null;
}

export function QuestionCompletionPanel({
  attempt,
  useStarDisplay = false,
  starScale = 5,
  onNext,
  onTryAgain,
  onFinish,
  remainingAttempts,
  isLastQuestion,
  isComplete = false,
  contentItemId,
}: QuestionCompletionPanelProps) {
  const scorePercentage = (attempt.score / attempt.max_score) * 100;
  const canTryAgain = remainingAttempts === null || remainingAttempts > 0;

  return (
    <div className="flex flex-col items-center gap-5 py-8">
      {/* Heading */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-1">
          <p className="text-base">Answer submitted</p>
          <CheckCircle2 className="text-green-500 size-4" />
        </div>
      </div>

      {/* Score / Rating */}
      <div className="flex flex-col items-center gap-1">
        <h6 className="text-sm text-muted-foreground">Your score</h6>
        {useStarDisplay ? (
          <StarRatingDisplay
            points={attempt.score}
            maxPoints={attempt.max_score}
            starScale={starScale}
            size="large"
            showNumeric={false}
          />
        ) : (
          <div
            className={`px-5 py-2.5 rounded-lg ${getScoreBgColor(scorePercentage)}`}
          >
            <span
              className={`text-2xl font-bold ${getScoreColor(scorePercentage)}`}
            >
              {attempt.score}/{attempt.max_score}
            </span>
            <span className="text-sm ml-2 text-muted-foreground">
              ({Math.round(scorePercentage)}%)
            </span>
          </div>
        )}
      </div>

      {/* Feedback (collapsed by default) */}
      {(attempt.evaluation_feedback ||
        (attempt.rubric_scores && attempt.rubric_scores.length > 0)) && (
        <div className="w-full max-w-xl">
          <Accordion type="single" collapsible>
            <AccordionItem value="feedback" className="border rounded-lg">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <span className="text-sm font-medium">View Feedback</span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-3">
                <AttemptFeedbackView
                  attempt={attempt}
                  useStarDisplay={useStarDisplay}
                  starScale={starScale}
                  showScoreSummary={false}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      )}

      {/* Action Buttons — hidden when assignment is already complete */}
      {!isComplete && (
        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
          {!isLastQuestion && (
            <Button onClick={onNext} size="lg" className="w-full">
              Next Question
            </Button>
          )}
          {isLastQuestion && onFinish && (
            <FinishAssessmentButton
              onFinish={onFinish}
              size="lg"
              className="w-full"
              contentItemId={contentItemId}
            />
          )}
          {canTryAgain && (
            <div className="flex flex-col items-center gap-1 w-full">
              <Button
                onClick={onTryAgain}
                variant="outline"
                size="lg"
                className="w-full"
              >
                Try Again
              </Button>
              {remainingAttempts !== null && (
                <p className="text-xs text-muted-foreground">
                  {remainingAttempts}{" "}
                  {remainingAttempts === 1 ? "try" : "tries"} available
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {isComplete && (
        <p className="text-sm text-muted-foreground text-center pt-2">
          All the questions are completed. Please proceed to the next item.
        </p>
      )}
    </div>
  );
}
