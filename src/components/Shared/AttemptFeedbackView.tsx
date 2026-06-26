"use client";

import type { RubricScore } from "@/types/submission";
import { StarRatingDisplay } from "@/components/StarRatingDisplay";
import {
  getScoreColor,
  getScoreBgColor,
  getRubricItemScoreColor,
} from "@/lib/utils/scoreDisplay";

export interface AttemptFeedbackViewProps {
  score: number;
  maxScore: number;
  feedback?: string | null;
  rubricScores?: RubricScore[] | null;
  useStarDisplay?: boolean;
  starScale?: number;
  /** When true, shows score summary block (e.g. for student panel). Teacher row omits it. */
  showScoreSummary?: boolean;
}

export function AttemptFeedbackView({
  score,
  maxScore,
  feedback,
  rubricScores,
  useStarDisplay = false,
  starScale = 5,
  showScoreSummary = false,
}: AttemptFeedbackViewProps) {
  const scorePercentage = maxScore > 0 ? (score / maxScore) * 100 : 0;

  const hasFeedback = feedback || (rubricScores && rubricScores.length > 0);

  if (!hasFeedback && !showScoreSummary) {
    return null;
  }

  return (
    <div className="space-y-3">
      {showScoreSummary && (
        <div
          className={`inline-flex px-5 py-2.5 rounded-lg ${getScoreBgColor(scorePercentage)}`}
        >
          <span
            className={`text-2xl font-bold ${getScoreColor(scorePercentage)}`}
          >
            {score}/{maxScore}
          </span>
          <span className="text-sm ml-2 text-muted-foreground">
            ({Math.round(scorePercentage)}%)
          </span>
        </div>
      )}

      {feedback && (
        <div className="p-3 bg-muted/50 rounded-md">
          <p className="text-sm whitespace-pre-wrap">{feedback}</p>
        </div>
      )}

      {rubricScores && rubricScores.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">
            Rubric Breakdown
          </p>
          {rubricScores.map((rubricItem, idx) => {
            const itemPercentage =
              rubricItem.points_possible > 0
                ? (rubricItem.points_earned / rubricItem.points_possible) * 100
                : 0;
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
                      className={`text-sm font-semibold ${getRubricItemScoreColor(itemPercentage)}`}
                    >
                      {rubricItem.points_earned}/{rubricItem.points_possible}{" "}
                      pts
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
    </div>
  );
}
