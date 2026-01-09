"use client";

import { SubmissionAttempt } from "@/types/submission";
import { Button } from "@/components/ui/button";

interface AttemptCardProps {
  attempt: SubmissionAttempt;
  questionOrder: number;
  onViewTranscript: (attempt: SubmissionAttempt, questionOrder: number) => void;
}

export function AttemptCard({ attempt, questionOrder, onViewTranscript }: AttemptCardProps) {
  const scorePercentage = attempt.max_score > 0
    ? (attempt.score / attempt.max_score) * 100
    : 0;

  const getScoreColor = (percentage: number) => {
    if (percentage >= 75) return "text-green-600 dark:text-green-400";
    if (percentage >= 50) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getItemScoreColor = (percentage: number) => {
    if (percentage >= 75) return "text-green-600 dark:text-green-400";
    if (percentage >= 50) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
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
        <div className="flex items-center gap-3">
          <span
            className={`text-sm font-semibold ${getScoreColor(
              scorePercentage
            )} ${attempt.stale ? "opacity-50" : ""}`}
          >
            Score: {attempt.score}/{attempt.max_score}
          </span>
          {attempt.answer_text && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewTranscript(attempt, questionOrder)}
            >
              View Transcript
            </Button>
          )}
        </div>
      </div>
      {attempt.evaluation_feedback && (
        <div className="p-3 bg-muted/50 rounded-md">
          <p className="text-xs font-semibold mb-2">
            Feedback:
          </p>
          <p className="text-sm whitespace-pre-wrap">
            {attempt.evaluation_feedback}
          </p>
        </div>
      )}
      {attempt.rubric_scores && attempt.rubric_scores.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold">Rubric Breakdown:</p>
          {attempt.rubric_scores.map((rubricItem, idx) => {
            const itemPercentage =
              (rubricItem.points_earned / rubricItem.points_possible) * 100;
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
                    className={`text-sm font-semibold ${getItemScoreColor(itemPercentage)}`}
                  >
                    {rubricItem.points_earned}/{rubricItem.points_possible} pts
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
      <div className="text-xs text-muted-foreground">
        {new Date(attempt.timestamp).toLocaleString()}
      </div>
    </div>
  );
}
