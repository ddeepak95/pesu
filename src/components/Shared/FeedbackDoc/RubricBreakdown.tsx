"use client";

import type { RubricScore } from "@/types/submission";
import { StarRatingDisplay } from "@/components/StarRatingDisplay";
import { formatPoints, getRubricItemScoreColor } from "@/lib/utils/scoreDisplay";

export interface RubricBreakdownProps {
  rubricScores: RubricScore[];
  useStarDisplay?: boolean;
  starScale?: number;
  /** Heading shown above the items (default "Rubric Breakdown"). Pass null to hide. */
  heading?: string | null;
}

/**
 * The per-rubric-item score + feedback list. Shared by the legacy
 * AttemptFeedbackView path and the `rubric` block of a structured feedback doc,
 * so the rubric always renders from rubric_scores (single source of truth).
 */
export function RubricBreakdown({
  rubricScores,
  useStarDisplay = false,
  starScale = 5,
  heading = "Rubric Breakdown",
}: RubricBreakdownProps) {
  if (!rubricScores || rubricScores.length === 0) return null;

  return (
    <div className="space-y-2">
      {heading && (
        <p className="text-xs font-semibold text-muted-foreground">{heading}</p>
      )}
      {rubricScores.map((rubricItem, idx) => {
        const itemPercentage =
          rubricItem.points_possible > 0
            ? (rubricItem.points_earned / rubricItem.points_possible) * 100
            : 0;
        return (
          <div key={idx} className="p-2 bg-muted/30 rounded-md space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">{rubricItem.item}</span>
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
                  {formatPoints(rubricItem.points_earned)}/
                  {formatPoints(rubricItem.points_possible)} pts
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
  );
}
