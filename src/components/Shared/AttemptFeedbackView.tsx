"use client";

import type { RubricScore } from "@/types/submission";
import type { FeedbackDoc } from "@/types/feedbackDoc";
import { feedbackDocHasContent } from "@/types/feedbackDoc";
import { getScoreColor, getScoreBgColor, formatPoints } from "@/lib/utils/scoreDisplay";
import { FeedbackDocView } from "@/components/Shared/FeedbackDoc/FeedbackDocView";
import { RubricBreakdown } from "@/components/Shared/FeedbackDoc/RubricBreakdown";

export interface AttemptFeedbackViewProps {
  score: number;
  maxScore: number;
  feedback?: string | null;
  /** Structured block document; when present it renders instead of plain `feedback`. */
  feedbackDoc?: FeedbackDoc | null;
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
  feedbackDoc,
  rubricScores,
  useStarDisplay = false,
  starScale = 5,
  showScoreSummary = false,
}: AttemptFeedbackViewProps) {
  const scorePercentage = maxScore > 0 ? (score / maxScore) * 100 : 0;

  const hasDoc = feedbackDocHasContent(feedbackDoc);
  const hasRubric = !!rubricScores && rubricScores.length > 0;
  const hasFeedback = hasDoc || feedback || hasRubric;

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
            {formatPoints(score)}/{formatPoints(maxScore)}
          </span>
          <span className="text-sm ml-2 text-muted-foreground">
            ({Math.round(scorePercentage)}%)
          </span>
        </div>
      )}

      {hasDoc ? (
        // Structured document path. The doc's `rubric` block (or the trailing
        // fallback) renders the rubric breakdown, so we don't render it again.
        <FeedbackDocView
          doc={feedbackDoc!}
          rubricScores={rubricScores}
          useStarDisplay={useStarDisplay}
          starScale={starScale}
          fallbackText={feedback}
        />
      ) : (
        // Legacy plain-text path.
        <>
          {feedback && (
            <div className="p-3 bg-muted/50 rounded-md">
              <p className="text-sm whitespace-pre-wrap">{feedback}</p>
            </div>
          )}
          {hasRubric && (
            <RubricBreakdown
              rubricScores={rubricScores!}
              useStarDisplay={useStarDisplay}
              starScale={starScale}
            />
          )}
        </>
      )}
    </div>
  );
}
