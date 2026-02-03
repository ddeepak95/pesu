"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SubmissionAttempt } from "@/types/submission";
import { StarRatingDisplay } from "../StarRatingDisplay";

interface AttemptsPanelProps {
  attempts: SubmissionAttempt[];
  maxAttempts?: number;
  useStarDisplay?: boolean;
  starScale?: number;
}

export function AttemptsPanel({
  attempts,
  maxAttempts,
  useStarDisplay = false,
  starScale = 5,
}: AttemptsPanelProps) {
  const getScoreColor = (percentage: number) => {
    if (percentage >= 75) return "text-green-600 dark:text-green-400";
    if (percentage >= 50) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const remainingAttempts = maxAttempts ? maxAttempts - attempts.length : null;

  return (
    <div className="mt-4 border rounded-lg">
      <div className="p-3 bg-muted/30 border-b">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Attempts</p>
          {maxAttempts && remainingAttempts !== null && (
            <p
              className={`text-sm font-semibold ${
                remainingAttempts === 0
                  ? "text-red-600 dark:text-red-400"
                  : remainingAttempts === 1
                  ? "text-yellow-600 dark:text-yellow-400"
                  : "text-green-600 dark:text-green-400"
              }`}
            >
              {remainingAttempts}{" "}
              {remainingAttempts === 1 ? "attempt" : "attempts"} remaining
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
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      Attempt {attempt.attempt_number}
                    </span>
                    {attempt.stale && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                        Stale
                      </span>
                    )}
                  </div>
                  {useStarDisplay ? (
                    <div className={attempt.stale ? "opacity-50" : ""}>
                      <StarRatingDisplay
                        points={attempt.score}
                        maxPoints={attempt.max_score}
                        starScale={starScale}
                        size="small"
                        showNumeric={false}
                      />
                    </div>
                  ) : (
                    <span
                      className={`text-sm font-semibold ${getScoreColor(
                        scorePercentage
                      )} ${attempt.stale ? "opacity-50" : ""}`}
                    >
                      {attempt.score}/{attempt.max_score}
                    </span>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent
                className={`px-4 pb-4 ${attempt.stale ? "opacity-60" : ""}`}
              >
                {attempt.stale && (
                  <div className="mb-4 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                    <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-200">
                      This attempt has been marked as stale by the teacher.
                    </p>
                  </div>
                )}
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
