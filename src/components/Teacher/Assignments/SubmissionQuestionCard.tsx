"use client";

import { useState } from "react";
import { QuestionEvaluations } from "@/types/submission";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SubmissionAttemptRow } from "./SubmissionAttemptRow";
import { SubmissionAttempt } from "@/types/submission";

interface SubmissionQuestionCardProps {
  questionOrder: number;
  questionPrompt: string;
  questionAnswers: QuestionEvaluations | undefined;
  submissionId: string;
  onViewTranscript: (attempt: SubmissionAttempt, questionOrder: number) => void;
}

export function SubmissionQuestionCard({
  questionOrder,
  questionPrompt,
  questionAnswers,
  submissionId,
  onViewTranscript,
}: SubmissionQuestionCardProps) {
  // Own local state so approval updates from child rows are reflected immediately
  const [attempts, setAttempts] = useState<SubmissionAttempt[]>(
    questionAnswers?.attempts ?? []
  );

  const handleAttemptUpdated = (updated: SubmissionAttempt) => {
    setAttempts((prev) =>
      prev.map((a) => (a.attempt_number === updated.attempt_number ? updated : a))
    );
  };

  const topScore =
    attempts.length > 0 ? Math.max(...attempts.map((a) => a.score)) : 0;
  const maxScore = attempts[0]?.max_score ?? 0;
  const hasPendingApprovals = attempts.some(
    (a) => a.feedback_approved === false && !a.is_evaluating
  );

  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="question" className="border rounded-lg px-4">
        <AccordionTrigger className="hover:no-underline py-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-left">
            <span className="font-medium">Question {questionOrder + 1}</span>
            <span
              className={`text-sm ${
                attempts.length > 0
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              Attempt: {attempts.length}
            </span>
            <span className="text-sm text-muted-foreground">
              Top Score:{" "}
              {attempts.length > 0 ? (
                <span className="font-medium text-foreground">
                  {topScore}/{maxScore}
                </span>
              ) : (
                "—"
              )}
            </span>
            {hasPendingApprovals && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                Pending Approval
              </span>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-4 space-y-4">
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {questionPrompt}
          </p>
          {attempts.length > 0 ? (
            <div className="space-y-3">
              {attempts.map((attempt) => (
                <SubmissionAttemptRow
                  key={attempt.attempt_number}
                  attempt={attempt}
                  questionOrder={questionOrder}
                  submissionId={submissionId}
                  onViewTranscript={onViewTranscript}
                  onAttemptUpdated={handleAttemptUpdated}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No attempts for this question yet.
            </p>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
