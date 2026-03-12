"use client";

import { useState } from "react";
import { SubmissionAttempt } from "@/types/submission";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AttemptFeedbackView } from "@/components/Shared/AttemptFeedbackView";
import { FeedbackApprovalEditor } from "@/components/Teacher/Assignments/FeedbackApprovalEditor";
import { getScoreColor } from "@/lib/utils/scoreDisplay";

interface SubmissionAttemptRowProps {
  attempt: SubmissionAttempt;
  questionOrder: number;
  submissionId: string;
  onViewTranscript: (
    attempt: SubmissionAttempt,
    questionOrder: number
  ) => void;
  /** Called when this attempt is updated (e.g. feedback approved) so parents can react */
  onAttemptUpdated?: (updatedAttempt: SubmissionAttempt) => void;
}

export function SubmissionAttemptRow({
  attempt: initialAttempt,
  questionOrder,
  submissionId,
  onViewTranscript,
  onAttemptUpdated,
}: SubmissionAttemptRowProps) {
  const [attempt, setAttempt] = useState<SubmissionAttempt>(initialAttempt);

  const scorePercentage =
    attempt.max_score > 0 ? (attempt.score / attempt.max_score) * 100 : 0;

  const isPendingApproval = attempt.feedback_approved === false;

  return (
    <div className="border rounded-lg overflow-hidden">
      <Accordion type="single" collapsible>
        <AccordionItem value="response" className="border-0">
          <AccordionTrigger className="px-4 py-3 hover:no-underline [&[data-state=open]>svg]:rotate-180">
            <div className="flex flex-wrap items-center justify-between gap-2 w-full text-left">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  Attempt {attempt.attempt_number}
                </span>
                {attempt.stale && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                    Stale
                  </span>
                )}
                {isPendingApproval && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                    Pending Approval
                  </span>
                )}
              </div>
              <span
                className={`text-sm font-semibold ${getScoreColor(
                  scorePercentage
                )} ${attempt.stale ? "opacity-50" : ""}`}
              >
                Score: {attempt.score}/{attempt.max_score}
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4 pt-0 space-y-3">
            {isPendingApproval ? (
              <FeedbackApprovalEditor
                attempt={attempt}
                submissionId={submissionId}
                questionOrder={questionOrder}
                onApproved={(updatedAttempt) => {
                  setAttempt(updatedAttempt);
                  onAttemptUpdated?.(updatedAttempt);
                }}
              />
            ) : (
              <AttemptFeedbackView attempt={attempt} />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewTranscript(attempt, questionOrder)}
            >
              View Transcript
            </Button>
            <div className="text-xs text-muted-foreground">
              {new Date(attempt.timestamp).toLocaleString()}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
