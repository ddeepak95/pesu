"use client";

interface AssessmentQuestionHeaderProps {
  questionNumber: number;
  totalQuestions: number;
  label?: string;
}

export function AssessmentQuestionHeader({
  questionNumber,
  totalQuestions,
  label = "Question",
}: AssessmentQuestionHeaderProps) {
  return (
    <div className="flex items-center">
      <p className="text-sm text-muted-foreground">
        {label} ({questionNumber}/{totalQuestions})
      </p>
    </div>
  );
}
