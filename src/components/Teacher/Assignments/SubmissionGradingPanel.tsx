"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EditableAttemptGradingForm } from "@/components/Teacher/Assignments/EditableAttemptGradingForm";
import { SubmissionAttempt } from "@/types/submission";
import {
  useAssignmentByIdForTeacher,
  useSubmissionById,
} from "@/hooks/swr";

function SkeletonLine({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-muted ${className ?? "h-4 w-full"}`} />
  );
}

interface SubmissionGradingPanelProps {
  submissionId: string;
  assignmentId: string;
  selectedQuestionIndex: number;
  onQuestionChange: (index: number) => void;
  selectedAttemptNumber: number | null;
  onAttemptChange: (attemptNumber: number | null) => void;
}

export function SubmissionGradingPanel({
  submissionId,
  assignmentId,
  selectedQuestionIndex,
  onQuestionChange,
  selectedAttemptNumber,
  onAttemptChange,
}: SubmissionGradingPanelProps) {
  const assignmentQuery = useAssignmentByIdForTeacher(assignmentId);
  const fullSubmissionQuery = useSubmissionById(submissionId);

  const assignment = assignmentQuery.data ?? null;
  const fullSubmission = fullSubmissionQuery.data ?? null;

  // Questions — from assignment (likely cached)
  const questions = useMemo(() => {
    if (!assignment) return [];
    if (assignment.dynamic_questions_enabled && fullSubmission?.generated_questions) {
      return [...fullSubmission.generated_questions].sort((a, b) => a.order - b.order);
    }
    return [...(assignment.questions ?? [])].sort((a, b) => a.order - b.order);
  }, [assignment, fullSubmission]);

  // Evaluations — from full submission (slow fetch)
  const evaluations = useMemo(() => {
    if (!fullSubmission?.evaluations || Array.isArray(fullSubmission.evaluations))
      return {};
    return fullSubmission.evaluations as Record<
      number | string,
      { attempts: SubmissionAttempt[] }
    >;
  }, [fullSubmission]);

  const currentQuestion = questions[selectedQuestionIndex] ?? null;
  const questionOrder = currentQuestion?.order ?? null;

  const currentAttempts = useMemo(() => {
    if (questionOrder === null) return [];
    const evals =
      (evaluations[questionOrder] as { attempts: SubmissionAttempt[] } | undefined) ??
      (evaluations[String(questionOrder)] as { attempts: SubmissionAttempt[] } | undefined);
    return evals?.attempts ?? [];
  }, [evaluations, questionOrder]);

  const [localAttempts, setLocalAttempts] = useState<SubmissionAttempt[]>([]);

  useEffect(() => {
    setLocalAttempts(currentAttempts);
  }, [currentAttempts]);

  useEffect(() => {
    if (fullSubmissionQuery.isLoading) return;
    if (localAttempts.length === 0) {
      if (selectedAttemptNumber !== null) onAttemptChange(null);
      return;
    }
    if (
      selectedAttemptNumber !== null &&
      localAttempts.some((attempt) => attempt.attempt_number === selectedAttemptNumber)
    ) {
      return;
    }
    const nonStale = localAttempts.filter((attempt) => !attempt.stale);
    const defaultAttempt =
      nonStale.length > 0
        ? nonStale[nonStale.length - 1]
        : localAttempts[localAttempts.length - 1];
    onAttemptChange(defaultAttempt.attempt_number);
  }, [
    fullSubmissionQuery.isLoading,
    selectedAttemptNumber,
    localAttempts,
    onAttemptChange,
  ]);

  const currentAttempt =
    selectedAttemptNumber !== null
      ? localAttempts.find((a) => a.attempt_number === selectedAttemptNumber) ?? null
      : null;

  const handleAttemptUpdated = (updated: SubmissionAttempt) => {
    setLocalAttempts((prev) =>
      prev.map((a) => (a.attempt_number === updated.attempt_number ? updated : a))
    );
  };

  const assignmentLoading = assignmentQuery.isLoading;
  const submissionLoading = fullSubmissionQuery.isLoading;
  const isDynamic =
    assignment?.dynamic_questions_enabled && !!fullSubmission?.generated_questions;

  return (
    <div className="space-y-5">
      <section className="space-y-4">
        {/* Question nav header — appears when assignment loads */}
        {assignmentLoading ? (
          <div className="flex items-center justify-between">
            <SkeletonLine className="h-5 w-24" />
            <SkeletonLine className="h-5 w-16" />
          </div>
        ) : questions.length > 0 ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">
                Question {selectedQuestionIndex + 1}
              </span>
              {isDynamic && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  Dynamic
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={selectedQuestionIndex <= 0}
                onClick={() => onQuestionChange(selectedQuestionIndex - 1)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span>{selectedQuestionIndex + 1}/{questions.length}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={selectedQuestionIndex >= questions.length - 1}
                onClick={() => onQuestionChange(selectedQuestionIndex + 1)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : null}

        {/* Question prompt — appears when assignment loads */}
        {assignmentLoading ? (
          <div className="space-y-2">
            <SkeletonLine className="h-4 w-full" />
            <SkeletonLine className="h-4 w-3/4" />
          </div>
        ) : currentQuestion ? (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {currentQuestion.prompt}
          </p>
        ) : null}

        {/* Attempt selector — appears when evaluation data arrives */}
        {submissionLoading ? (
          <SkeletonLine className="h-9 w-40" />
        ) : localAttempts.length > 0 ? (
          <Select
            value={selectedAttemptNumber?.toString() ?? ""}
            onValueChange={(value) => onAttemptChange(value ? parseInt(value) : null)}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Select attempt" />
            </SelectTrigger>
            <SelectContent>
              {localAttempts.map((attempt) => (
                <SelectItem
                  key={attempt.attempt_number}
                  value={attempt.attempt_number.toString()}
                >
                  Attempt {attempt.attempt_number}
                  {attempt.stale ? " (stale)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </section>

      {/* Rubric + feedback — appears when full submission loads */}
      {submissionLoading ? (
        <div className="space-y-3">
          <SkeletonLine className="h-20 w-full" />
          <SkeletonLine className="h-20 w-full" />
        </div>
      ) : currentAttempt ? (
        <EditableAttemptGradingForm
          attempt={currentAttempt}
          submissionId={submissionId}
          questionOrder={questionOrder!}
          onSaved={handleAttemptUpdated}
        />
      ) : !submissionLoading && localAttempts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No attempts for this question yet.
        </p>
      ) : null}

      {/* Prev / Next question */}
      {!assignmentLoading && questions.length > 1 && (
        <div className="flex items-center justify-between pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            disabled={selectedQuestionIndex <= 0}
            onClick={() => onQuestionChange(selectedQuestionIndex - 1)}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Prev Question
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={selectedQuestionIndex >= questions.length - 1}
            onClick={() => onQuestionChange(selectedQuestionIndex + 1)}
          >
            Next Question
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
