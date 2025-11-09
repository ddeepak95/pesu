"use client";
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SubmissionAttempt } from "@/types/submission";
import { CheckCircle2 } from "lucide-react";

interface AttemptHistoryProps {
  attempts: SubmissionAttempt[];
  selectedAttempt?: number;
  onSelectAttempt?: (attemptNumber: number) => void;
  className?: string;
}

/**
 * Display history of previous attempts with scores
 */
export function AttemptHistory({
  attempts,
  selectedAttempt,
  onSelectAttempt,
  className = "",
}: AttemptHistoryProps) {
  if (!attempts || attempts.length === 0) {
    return null;
  }

  // Sort attempts by attempt number descending (latest first)
  const sortedAttempts = [...attempts].sort(
    (a, b) => b.attempt_number - a.attempt_number
  );

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">Previous Attempts</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible>
          {sortedAttempts.map((attempt) => {
            const scorePercentage = (attempt.score / attempt.max_score) * 100;
            const isSelected = attempt.attempt_number === selectedAttempt;

            return (
              <AccordionItem
                key={attempt.attempt_number}
                value={`attempt-${attempt.attempt_number}`}
              >
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center justify-between w-full pr-2">
                    <div className="flex items-center gap-2">
                      {isSelected && (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      )}
                      <span>Attempt #{attempt.attempt_number}</span>
                    </div>
                    <span
                      className={`font-semibold ${
                        scorePercentage >= 75
                          ? "text-green-600 dark:text-green-400"
                          : scorePercentage >= 50
                          ? "text-yellow-600 dark:text-yellow-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {attempt.score}/{attempt.max_score}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 pt-2">
                    {/* Overall Feedback */}
                    {attempt.evaluation_feedback && (
                      <div className="p-3 bg-muted/50 rounded-md">
                        <p className="text-xs font-semibold mb-1">Feedback:</p>
                        <p className="text-sm">{attempt.evaluation_feedback}</p>
                      </div>
                    )}

                    {/* Rubric Scores */}
                    {attempt.rubric_scores && attempt.rubric_scores.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold">Rubric Breakdown:</p>
                        {attempt.rubric_scores.map((rubric, idx) => (
                          <div
                            key={idx}
                            className="text-sm flex justify-between items-center"
                          >
                            <span className="text-muted-foreground">
                              {rubric.item}
                            </span>
                            <span className="font-medium">
                              {rubric.points_earned}/{rubric.points_possible}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Timestamp */}
                    <div className="text-xs text-muted-foreground">
                      {new Date(attempt.timestamp).toLocaleString()}
                    </div>

                    {/* Select Button */}
                    {onSelectAttempt && !isSelected && (
                      <button
                        onClick={() => onSelectAttempt(attempt.attempt_number)}
                        className="text-xs text-primary hover:underline"
                      >
                        Use this attempt for grading
                      </button>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}

