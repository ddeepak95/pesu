"use client";

import { QuestionEvaluations } from "@/types/submission";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AttemptCard } from "./AttemptCard";
import { SubmissionAttempt } from "@/types/submission";

interface QuestionAttemptsCardProps {
  questionOrder: number;
  questionPrompt: string;
  questionAnswers: QuestionEvaluations | undefined;
  onViewTranscript: (attempt: SubmissionAttempt, questionOrder: number) => void;
}

export function QuestionAttemptsCard({
  questionOrder,
  questionPrompt,
  questionAnswers,
  onViewTranscript,
}: QuestionAttemptsCardProps) {
  const attempts = questionAnswers?.attempts || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {questionPrompt}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {attempts.length > 0 ? (
          <div className="space-y-4">
            {attempts.map((attempt) => (
              <AttemptCard
                key={attempt.attempt_number}
                attempt={attempt}
                questionOrder={questionOrder}
                onViewTranscript={onViewTranscript}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No attempts for this question yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
