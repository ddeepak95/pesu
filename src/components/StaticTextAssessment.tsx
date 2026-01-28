"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, FileText } from "lucide-react";
import { Question } from "@/types/assignment";
import { SubmissionAttempt } from "@/types/submission";
import { getQuestionAttempts } from "@/lib/queries/submissions";
import { AssessmentQuestionHeader } from "@/components/Shared/AssessmentQuestionHeader";
import { AssessmentQuestionCard } from "@/components/Shared/AssessmentQuestionCard";
import { AttemptsPanel } from "@/components/Shared/AttemptsPanel";
import { AssessmentNavigation } from "@/components/Shared/AssessmentNavigation";
import { EvaluatingIndicator } from "@/components/Shared/EvaluatingIndicator";

interface StaticTextAssessmentProps {
  question: Question;
  language: string;
  assignmentId: string;
  submissionId: string;
  questionNumber: number;
  totalQuestions: number;
  onAnswerSave: (answer: string) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  isFirstQuestion: boolean;
  isLastQuestion: boolean;
  existingAnswer?: string;
  onLanguageChange?: (language: string) => void;
  currentAttemptNumber?: number;
  maxAttempts?: number;
  maxAttemptsReached?: boolean;
}

export function StaticTextAssessment({
  question,
  language,
  submissionId,
  questionNumber,
  totalQuestions,
  onAnswerSave,
  onPrevious,
  onNext,
  isFirstQuestion,
  isLastQuestion,
  existingAnswer,
  onLanguageChange,
  maxAttempts,
  maxAttemptsReached,
}: StaticTextAssessmentProps) {
  const [answer, setAnswer] = React.useState("");
  const [isEvaluating, setIsEvaluating] = React.useState(false);
  const [attempts, setAttempts] = React.useState<SubmissionAttempt[]>([]);

  const restoredFromStorageRef = React.useRef(false);
  const storageKey = React.useMemo(
    () => `static-${submissionId}-${question.order}`,
    [submissionId, question.order]
  );

  // Restore any in-progress answer from localStorage (runs once per question)
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        restoredFromStorageRef.current = true;
        setAnswer(stored);
      }
    } catch {
      // ignore storage errors
    }
  }, [storageKey]);

  // Load existing attempts for this question
  React.useEffect(() => {
    setAttempts([]);
    async function loadAttempts() {
      try {
        const questionAttempts = await getQuestionAttempts(
          submissionId,
          question.order,
          true // Exclude stale attempts
        );
        setAttempts(questionAttempts);

        // If we already restored from storage, don't overwrite that state.
        // Otherwise, start with empty textarea for a fresh attempt.
        if (!restoredFromStorageRef.current) {
          if (existingAnswer && questionAttempts.length === 0) {
            setAnswer(existingAnswer);
          } else {
            // Start with empty textarea for new attempts
            setAnswer("");
          }
        }
      } catch (error) {
        console.error("Error loading attempts for static assessment:", error);
        // On error, start with empty textarea
        if (!restoredFromStorageRef.current) {
          setAnswer("");
        }
      }
    }

    loadAttempts();
  }, [question.order, submissionId, storageKey, existingAnswer]);

  // Persist draft to localStorage so it survives refresh while in progress
  React.useEffect(() => {
    // Do not store empty state
    if (!answer) return;
    try {
      window.localStorage.setItem(storageKey, answer);
    } catch {
      // ignore storage errors
    }
  }, [answer, storageKey]);

  // Copy/Paste prevention handlers
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    // Could show a toast notification here if desired
  };

  const handleCopy = (e: React.ClipboardEvent) => {
    e.preventDefault();
  };

  const handleCut = (e: React.ClipboardEvent) => {
    e.preventDefault();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Block Ctrl+V, Ctrl+C, Ctrl+X, Cmd+V, Cmd+C, Cmd+X
    if (
      (e.ctrlKey || e.metaKey) &&
      (e.key === "v" || e.key === "c" || e.key === "x")
    ) {
      e.preventDefault();
    }
  };

  const handleSubmit = async () => {
    const trimmedAnswer = answer.trim();
    if (!trimmedAnswer) {
      alert("Please type your answer before submitting.");
      return;
    }

    // Prevent submitting if max attempts reached
    if (maxAttemptsReached) {
      alert(
        "You have reached the maximum number of attempts for this question."
      );
      return;
    }

    setIsEvaluating(true);
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          submissionId,
          questionOrder: question.order,
          answerText: trimmedAnswer,
          questionPrompt: question.prompt,
          rubric: question.rubric,
          language,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Evaluation API error:", errorData);
        throw new Error(errorData.error || "Evaluation failed");
      }

      const result = await response.json();
      const newAttempt = result.attempt as SubmissionAttempt;
      if (!newAttempt) {
        throw new Error("No attempt data received from evaluation API");
      }

      setAttempts((prev) => [...prev, newAttempt]);
      onAnswerSave(trimmedAnswer);

      // Clear the textarea for a new attempt and remove stored draft
      setAnswer("");
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // ignore storage errors
      }
    } catch (error) {
      console.error("Error evaluating static text answer:", error);
      alert(
        `Failed to evaluate your answer: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleSaveAndNavigate = (action: "previous" | "next") => {
    const trimmedAnswer = answer.trim();
    if (trimmedAnswer) {
      onAnswerSave(trimmedAnswer);
    }

    if (action === "previous" && onPrevious) {
      onPrevious();
    } else if (action === "next" && onNext) {
      onNext();
    }
  };

  const hasContent = answer.trim().length > 0;
  const wordCount = answer.trim() ? answer.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-6">
      <AssessmentQuestionHeader
        questionNumber={questionNumber}
        totalQuestions={totalQuestions}
        language={language}
        onLanguageChange={onLanguageChange}
        languageDisabled={isEvaluating}
      />

      <AssessmentQuestionCard question={question}>
        {/* Static Text Input Area */}
        <div className="mt-4 border rounded-xl bg-background shadow-sm">
          <div className="p-4">
            {/* Icon and instructions */}
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                Type your answer below. Copy and paste are disabled.
              </p>
            </div>

            {/* Textarea */}
            <Textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onPaste={handlePaste}
              onCopy={handleCopy}
              onCut={handleCut}
              onContextMenu={handleContextMenu}
              onKeyDown={handleKeyDown}
              placeholder={
                maxAttemptsReached
                  ? "Maximum attempts reached. You can view your previous attempts below."
                  : "Type your answer here..."
              }
              rows={8}
              className="resize-none min-h-[200px] focus-visible:ring-primary"
              disabled={maxAttemptsReached || isEvaluating}
            />

            {/* Word count and submit button */}
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-muted-foreground">
                {wordCount} {wordCount === 1 ? "word" : "words"}
              </p>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!hasContent || isEvaluating || maxAttemptsReached}
              >
                {isEvaluating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Evaluating...
                  </>
                ) : (
                  "Submit Answer"
                )}
              </Button>
            </div>

            {maxAttemptsReached && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Maximum attempts reached. You can view your previous attempts
                below.
              </p>
            )}
          </div>
        </div>

        {/* Evaluating State */}
        {isEvaluating && <EvaluatingIndicator />}

        {/* Attempts Section */}
        <AttemptsPanel
          attempts={attempts}
          maxAttempts={maxAttempts}
        />
      </AssessmentQuestionCard>

      {/* Navigation Buttons */}
      <AssessmentNavigation
        isFirstQuestion={isFirstQuestion}
        isLastQuestion={isLastQuestion}
        onPrevious={() => handleSaveAndNavigate("previous")}
        onNext={() => handleSaveAndNavigate("next")}
        previousDisabled={isEvaluating}
        nextDisabled={isEvaluating}
      />
    </div>
  );
}
