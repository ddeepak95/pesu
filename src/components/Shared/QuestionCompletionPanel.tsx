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

  const getScoreColor = (percentage: number) => {
    if (percentage >= 90) return "text-green-600 dark:text-green-400";
    if (percentage >= 75) return "text-blue-600 dark:text-blue-400";
    if (percentage >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getScoreBgColor = (percentage: number) => {
    if (percentage >= 90) return "bg-green-100 dark:bg-green-900/30";
    if (percentage >= 75) return "bg-blue-100 dark:bg-blue-900/30";
    if (percentage >= 60) return "bg-yellow-100 dark:bg-yellow-900/30";
    return "bg-red-100 dark:bg-red-900/30";
  };

  const canTryAgain = remainingAttempts === null || remainingAttempts > 0;

  return (
    <div className="flex flex-col items-center gap-5 py-8">
      {/* Heading */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-1">
          <p className="text-base">Answer submitted</p>
          <CheckCircle2 className="text-green-500 size-4" />
        </div>

        <p className="text-sm text-muted-foreground">
          {isLastQuestion
            ? "You have answered all questions."
            : "Proceed to Next Question"}
        </p>
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
                {attempt.evaluation_feedback && (
                  <div className="p-3 bg-muted/50 rounded-md">
                    <p className="text-sm whitespace-pre-wrap">
                      {attempt.evaluation_feedback}
                    </p>
                  </div>
                )}
                {attempt.rubric_scores && attempt.rubric_scores.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">
                      Rubric Breakdown
                    </p>
                    {attempt.rubric_scores.map((rubricItem, idx) => {
                      const itemPercentage =
                        (rubricItem.points_earned /
                          rubricItem.points_possible) *
                        100;
                      return (
                        <div
                          key={idx}
                          className="p-2 bg-muted/30 rounded-md space-y-1"
                        >
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">
                              {rubricItem.item}
                            </span>
                            {useStarDisplay ? (
                              <StarRatingDisplay
                                points={rubricItem.points_earned}
                                maxPoints={rubricItem.points_possible}
                                starScale={starScale}
                                size="small"
                                showNumeric={false}
                              />
                            ) : (
                              <span
                                className={`text-sm font-semibold ${
                                  itemPercentage >= 75
                                    ? "text-green-600 dark:text-green-400"
                                    : itemPercentage >= 50
                                      ? "text-yellow-600 dark:text-yellow-400"
                                      : "text-red-600 dark:text-red-400"
                                }`}
                              >
                                {rubricItem.points_earned}/
                                {rubricItem.points_possible} pts
                              </span>
                            )}
                          </div>
                          {rubricItem.feedback && (
                            <p className="text-xs text-muted-foreground">
                              {rubricItem.feedback}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      )}

      {/* Action Buttons */}
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
            isComplete={isComplete}
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
                {remainingAttempts} {remainingAttempts === 1 ? "try" : "tries"}{" "}
                available
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
