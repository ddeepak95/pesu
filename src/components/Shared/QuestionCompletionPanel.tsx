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
import { FeedbackTentativeBanner } from "@/components/Shared/FeedbackTentativeBanner";
import { getScoreColor, getScoreBgColor } from "@/lib/utils/scoreDisplay";
import { CheckCircle2 } from "lucide-react";
import { useAssessmentTracking } from "@/contexts/AssessmentTrackingContext";

interface QuestionCompletionPanelProps {
  attempt: SubmissionAttempt;
  /** All non-stale attempts for this question (drives the counted-attempt selector). */
  attempts?: SubmissionAttempt[];
  /** Attempt number that currently counts toward the grade. */
  selectedAttemptNumber?: number | null;
  /** Change the counted attempt. Only wired while selection is editable. */
  onSelectAttempt?: (attemptNumber: number) => void;
  /** Student may change the selection only before they finish (status <> completed). */
  selectionEditable?: boolean;
  useStarDisplay?: boolean;
  starScale?: number;
  onNext: () => void;
  onTryAgain: () => void;
  onFinish?: () => void;
  remainingAttempts: number | null;
  isLastQuestion: boolean;
  isComplete?: boolean;
  contentItemId?: string | null;
  /**
   * True when this attempt's grade is tentative — the assignment requires teacher
   * approval and the submission has not been released. The score/feedback are
   * shown openly under a tentative banner.
   */
  tentative?: boolean;
}

export function QuestionCompletionPanel({
  attempt,
  attempts = [],
  selectedAttemptNumber = null,
  onSelectAttempt,
  selectionEditable = false,
  useStarDisplay = false,
  starScale = 5,
  onNext,
  onTryAgain,
  onFinish,
  remainingAttempts,
  isLastQuestion,
  isComplete = false,
  contentItemId,
  tentative = false,
}: QuestionCompletionPanelProps) {
  const { trackFeedbackOpened } = useAssessmentTracking();
  const score = attempt.score ?? 0;
  const scorePercentage = attempt.max_score > 0 ? (score / attempt.max_score) * 100 : 0;
  // Retry depends only on remaining attempts — it is no longer gated on pending review.
  const canTryAgain = remainingAttempts === null || remainingAttempts > 0;

  const showSelector =
    selectionEditable && !!onSelectAttempt && attempts.length >= 2;

  return (
    <div className="flex flex-col items-center gap-5 py-8">
      {/* Heading */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-1">
          <p className="text-base">Answer submitted</p>
          <CheckCircle2 className="text-green-500 size-4" />
        </div>
      </div>

      {/* Score / Rating — shown openly, including tentative results. */}
      <div className="flex flex-col items-center gap-1">
        <h6 className="text-sm text-muted-foreground">
          {tentative ? "Tentative score" : "Your score"}
        </h6>
        {useStarDisplay ? (
          <StarRatingDisplay
            points={score}
            maxPoints={attempt.max_score}
            starScale={starScale}
            size="large"
            showNumeric={false}
          />
        ) : (
          <div
            className={`px-5 py-2.5 rounded-lg ${getScoreBgColor(scorePercentage)}`}
          >
            <span className={`text-2xl font-bold ${getScoreColor(scorePercentage)}`}>
              {score}/{attempt.max_score}
            </span>
            <span className="text-sm ml-2 text-muted-foreground">
              ({Math.round(scorePercentage)}%)
            </span>
          </div>
        )}
      </div>

      {/* Feedback section */}
      <div className="w-full max-w-xl space-y-3">
        {tentative && <FeedbackTentativeBanner />}
        {(attempt.feedback ||
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
                  score={score}
                  maxScore={attempt.max_score}
                  feedback={attempt.feedback}
                  rubricScores={attempt.rubric_scores}
                  useStarDisplay={useStarDisplay}
                  starScale={starScale}
                  showScoreSummary={false}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </div>

      {/* Counted-attempt selector (only before finishing, with >1 attempt) */}
      {showSelector && (
        <div className="flex flex-col items-center gap-1.5 w-full max-w-xs">
          <p className="text-xs text-muted-foreground">
            Which attempt should count toward your grade?
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {attempts.map((a) => {
              const selected = a.attempt_number === selectedAttemptNumber;
              return (
                <Button
                  key={a.attempt_number}
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  onClick={() => onSelectAttempt?.(a.attempt_number)}
                >
                  Attempt {a.attempt_number}
                </Button>
              );
            })}
          </div>
        </div>
      )}

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
          {contentItemId
            ? "All the questions are completed. Please proceed to the next item."
            : "All the questions are completed. Your responses have been submitted."}
        </p>
      )}
    </div>
  );
}
