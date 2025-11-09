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

interface EvaluationDisplayProps {
  attempt: SubmissionAttempt;
  className?: string;
}

/**
 * Display evaluation results with score, rubric breakdown, and feedback
 */
export function EvaluationDisplay({
  attempt,
  className = "",
}: EvaluationDisplayProps) {
  const scorePercentage = (attempt.score / attempt.max_score) * 100;

  // Color coding based on score
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

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Your Score</span>
          <div
            className={`px-4 py-2 rounded-lg ${getScoreBgColor(
              scorePercentage
            )}`}
          >
            <span className={`text-2xl font-bold ${getScoreColor(scorePercentage)}`}>
              {attempt.score}/{attempt.max_score}
            </span>
            <span className="text-sm ml-2 text-muted-foreground">
              ({Math.round(scorePercentage)}%)
            </span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Feedback */}
        {attempt.evaluation_feedback && (
          <div className="p-4 bg-muted/50 rounded-md">
            <p className="text-sm font-semibold mb-2">Overall Feedback:</p>
            <p className="text-sm whitespace-pre-wrap">
              {attempt.evaluation_feedback}
            </p>
          </div>
        )}

        {/* Rubric Breakdown */}
        {attempt.rubric_scores && attempt.rubric_scores.length > 0 && (
          <Accordion type="single" collapsible defaultValue="rubric-breakdown">
            <AccordionItem value="rubric-breakdown">
              <AccordionTrigger>Detailed Rubric Breakdown</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  {attempt.rubric_scores.map((rubricItem, idx) => {
                    const itemPercentage =
                      (rubricItem.points_earned / rubricItem.points_possible) *
                      100;
                    return (
                      <div
                        key={idx}
                        className="p-3 bg-muted/30 rounded-md space-y-2"
                      >
                        <div className="flex justify-between items-start gap-4">
                          <span className="flex-1 font-medium">
                            {rubricItem.item}
                          </span>
                          <span
                            className={`font-semibold whitespace-nowrap ${
                              itemPercentage >= 75
                                ? "text-green-600 dark:text-green-400"
                                : itemPercentage >= 50
                                ? "text-yellow-600 dark:text-yellow-400"
                                : "text-red-600 dark:text-red-400"
                            }`}
                          >
                            {rubricItem.points_earned}/{rubricItem.points_possible} pts
                          </span>
                        </div>
                        {rubricItem.feedback && (
                          <p className="text-sm text-muted-foreground">
                            {rubricItem.feedback}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {/* Attempt Info */}
        <div className="text-xs text-muted-foreground text-center pt-2">
          Attempt #{attempt.attempt_number} •{" "}
          {new Date(attempt.timestamp).toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
}

