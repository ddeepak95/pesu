"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  QuestionReviewStatusIcon,
  type QuestionReviewStatus,
} from "@/components/Teacher/Assignments/QuestionReviewStatusIcon";
import {
  useAssignmentByIdForTeacher,
  useSubmissionById,
  useSubmissionGrading,
} from "@/hooks/swr";

function SkeletonLine({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-muted ${className ?? "h-4 w-full"}`} />
  );
}

interface SubmissionQuestionSectionProps {
  submissionId: string;
  assignmentId: string;
  selectedQuestionIndex: number;
  onQuestionChange: (index: number) => void;
  className?: string;
}

/**
 * The question being graded: number, Dynamic tag, review progress, question
 * navigation, and the prompt itself. Lives above/beside the grading panel
 * (overlay header bar and the submission dialog) so the prompt reads as primary
 * content rather than a muted aside.
 */
export function SubmissionQuestionSection({
  submissionId,
  assignmentId,
  selectedQuestionIndex,
  onQuestionChange,
  className,
}: SubmissionQuestionSectionProps) {
  const assignmentQuery = useAssignmentByIdForTeacher(assignmentId);
  const fullSubmissionQuery = useSubmissionById(submissionId);
  const gradingQuery = useSubmissionGrading(submissionId);

  const assignment = assignmentQuery.data ?? null;
  const fullSubmission = fullSubmissionQuery.data ?? null;
  const grading = gradingQuery.data ?? null;

  // Question prompts come from the assignment (or per-submission generated set).
  const questions = useMemo(() => {
    if (!assignment) return [];
    if (assignment.dynamic_questions_enabled && fullSubmission?.generated_questions) {
      return [...fullSubmission.generated_questions].sort((a, b) => a.order - b.order);
    }
    return [...(assignment.questions ?? [])].sort((a, b) => a.order - b.order);
  }, [assignment, fullSubmission]);

  const currentQuestion = questions[selectedQuestionIndex] ?? null;

  const assignmentLoading = assignmentQuery.isLoading;
  const isDynamic =
    assignment?.dynamic_questions_enabled && !!fullSubmission?.generated_questions;

  // Review status of the current question, keyed by question order.
  // green = reviewed, orange = submitted but not reviewed, red = not submitted.
  const currentStatus = useMemo<QuestionReviewStatus | null>(() => {
    if (!currentQuestion) return null;
    const gradingQuestion = (grading?.questions ?? []).find(
      (q) => q.question_order === currentQuestion.order,
    );
    const submitted = gradingQuestion?.attempts.some((a) => !a.stale) ?? false;
    if (!submitted) return "not-submitted";
    return gradingQuestion?.reviewed ? "reviewed" : "unreviewed";
  }, [grading, currentQuestion]);

  return (
    <section className={className}>
      {/* Question nav header */}
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
            {currentStatus && <QuestionReviewStatusIcon status={currentStatus} />}
            {isDynamic && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                Dynamic
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
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
        </div>
      ) : null}

      {/* Question prompt */}
      {assignmentLoading ? (
        <div className="space-y-2 mt-3">
          <SkeletonLine className="h-4 w-full" />
          <SkeletonLine className="h-4 w-3/4" />
        </div>
      ) : currentQuestion ? (
        <p className="text-sm text-foreground whitespace-pre-wrap mt-3">
          {currentQuestion.prompt}
        </p>
      ) : null}
    </section>
  );
}
