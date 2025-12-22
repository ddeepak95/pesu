"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SubmissionAttempt } from "@/types/submission";

interface AttemptsPanelProps {
  attempts: SubmissionAttempt[];
  maxAttempts?: number;
  maxAttemptsReached?: boolean;
}

export function AttemptsPanel({
  attempts,
  maxAttempts,
  maxAttemptsReached,
}: AttemptsPanelProps) {
  const currentQuestionAttemptNumber = attempts.length + 1;

  const getScoreColor = (percentage: number) => {
    if (percentage >= 75) return "text-green-600 dark:text-green-400";
    if (percentage >= 50) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  return (
    <div className="mt-4 border rounded-lg">
      <div className="p-3 bg-muted/30 border-b">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Attempts</p>
            {maxAttempts && (
              <p className="text-xs text-muted-foreground mt-1">
                {attempts.length > 0
                  ? `Attempt ${currentQuestionAttemptNumber} of ${maxAttempts}`
                  : `Attempt 1 of ${maxAttempts}`}
                {maxAttemptsReached && " (Maximum reached)"}
              </p>
            )}
          </div>
          {maxAttempts && (
            <p className="text-xs text-muted-foreground">
              Your best attempt will be used for final grading.
            </p>
          )}
        </div>
      </div>
      <Accordion type="single" collapsible className="w-full">
        {attempts.map((attempt) => {
          const scorePercentage = (attempt.score / attempt.max_score) * 100;

          return (
            <AccordionItem
              key={attempt.attempt_number}
              value={`attempt-${attempt.attempt_number}`}
              className="border-b last:border-b-0"
            >
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
                <div className="flex items-center justify-between w-full pr-2">
                  <span className="text-sm font-medium">
                    Attempt {attempt.attempt_number}
                  </span>
                  <span
                    className={`text-sm font-semibold ${getScoreColor(
                      scorePercentage
                    )}`}
                  >
                    {attempt.score}/{attempt.max_score}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                {/* Overall Feedback */}
                {attempt.evaluation_feedback && (
                  <div className="mb-4 p-3 bg-muted/50 rounded-md">
                    <p className="text-xs font-semibold mb-2">
                      Overall Feedback:
                    </p>
                    <p className="text-sm whitespace-pre-wrap">
                      {attempt.evaluation_feedback}
                    </p>
                  </div>
                )}

                {/* Rubric Breakdown */}
                {attempt.rubric_scores && attempt.rubric_scores.length > 0 && (
                  <div className="space-y-2 mb-4">
                    <p className="text-xs font-semibold">Rubric Breakdown:</p>
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

                {/* Timestamp */}
                <div className="text-xs text-muted-foreground">
                  {new Date(attempt.timestamp).toLocaleString()}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

