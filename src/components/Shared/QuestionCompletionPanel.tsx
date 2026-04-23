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
import { FeedbackPendingBanner } from "@/components/Shared/FeedbackPendingBanner";
import { FeedbackAvailableBanner } from "@/components/Shared/FeedbackAvailableBanner";
import { getScoreColor, getScoreBgColor } from "@/lib/utils/scoreDisplay";
import { CheckCircle2 } from "lucide-react";
import { useAssessmentTracking } from "@/contexts/AssessmentTrackingContext";

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
  /** True when the attempt's feedback is awaiting teacher approval. */
  feedbackApprovalPending?: boolean;
  /** True when the assignment is configured to require teacher approval. */
  feedbackRequiresApproval?: boolean;
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
  feedbackApprovalPending = false,
  feedbackRequiresApproval = false,
}: QuestionCompletionPanelProps) {
  const { trackFeedbackOpened } = useAssessmentTracking();
  const scorePercentage = (attempt.score / attempt.max_score) * 100;
  // Retry is blocked while feedback is pending approval
  const canTryAgain =
    !feedbackApprovalPending &&
    (remainingAttempts === null || remainingAttempts > 0);

  return (
    <div className="flex flex-col items-center gap-5 py-8">
      {/* Heading */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-1">
          <p className="text-base">Answer submitted</p>
          <CheckCircle2 className="text-green-500 size-4" />
        </div>
      </div>

      {/* Score / Rating — hidden while feedback is pending approval.
          The stub score is 0 and even the real score should not be revealed
          until the teacher approves the feedback. */}
      {!feedbackApprovalPending && (
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
      )}

      {/* Feedback section — behaviour depends on approval state */}
      <div className="w-full max-w-xl space-y-3">
        {feedbackApprovalPending ? (
          <FeedbackPendingBanner />
        ) : (
          <>
            {feedbackRequiresApproval && <FeedbackAvailableBanner />}
            {(attempt.evaluation_feedback ||
              (attempt.rubric_scores && attempt.rubric_scores.length > 0)) && (
              <Accordion
                type="single"
                collapsible
                onValueChange={(value) => {
                  if (value === "feedback") trackFeedbackOpened();
                }}
              >
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
            )}
          </>
        )}
      </div>

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
