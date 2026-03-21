"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, FileText } from "lucide-react";
import { EvaluatingIndicator } from "@/components/Shared/EvaluatingIndicator";
import { useActivityTracking } from "@/hooks/useActivityTracking";
import type { AssessmentInputProps } from "./types";
import { createBulkInputGuard } from "./wordLimitGuards";

export function StaticTextInputArea({
  question,
  assignmentId,
  submissionId,
  existingAnswer,
  maxAttemptsReached,
  attempts,
  isEvaluating,
  onSubmitForEvaluation,
  onLanguageDisabledChange,
  allowCopyPaste = false,
}: AssessmentInputProps) {
  const [hasStarted, setHasStarted] = React.useState(false);
  const [answer, setAnswer] = React.useState("");

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const { logEvent } = useActivityTracking({
    componentType: "question",
    componentId: assignmentId,
    subComponentId: String(question.order),
  });

  const restoredFromStorageRef = React.useRef(false);
  const storageKey = React.useMemo(
    () => `static-${submissionId}-${question.order}`,
    [submissionId, question.order],
  );

  const { guard, sync } = React.useMemo(
    () => createBulkInputGuard(submissionId),
    [submissionId],
  );

  // Report language-disabled state to the shell
  React.useEffect(() => {
    onLanguageDisabledChange?.(isEvaluating || hasStarted);
  }, [isEvaluating, hasStarted, onLanguageDisabledChange]);

  // Restore in-progress answer from localStorage (only on first run per question)
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        restoredFromStorageRef.current = true;
        setAnswer(stored);
        sync(stored);
        setHasStarted(true);
      }
    } catch {
      /* ignore */
    }
  }, [storageKey, sync]);

  // Reset state when question changes (if no localStorage restore)
  React.useEffect(() => {
    if (!restoredFromStorageRef.current) {
      if (existingAnswer && attempts.length === 0) {
        setAnswer(existingAnswer);
        sync(existingAnswer);
        setHasStarted(true);
      } else {
        setAnswer("");
        sync("");
        setHasStarted(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.order, submissionId]);

  // When user clicks "Try Again" (attempts already exist), clear previous response so input starts empty
  React.useEffect(() => {
    if (attempts.length > 0) {
      setAnswer("");
      sync("");
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
    }
  }, [attempts.length, storageKey, sync]);

  // Persist draft to localStorage
  React.useEffect(() => {
    if (!answer) return;
    try {
      window.localStorage.setItem(storageKey, answer);
    } catch {
      /* ignore */
    }
  }, [answer, storageKey]);

  const handleStartWriting = () => {
    if (maxAttemptsReached) {
      alert(
        "You have reached the maximum number of attempts for this question.",
      );
      return;
    }
    setHasStarted(true);
    logEvent("attempt_started");
  };

  const handleSubmit = async () => {
    const trimmedAnswer = answer.trim();
    if (!trimmedAnswer) {
      alert("Please type your answer before submitting.");
      return;
    }
    if (maxAttemptsReached) {
      alert(
        "You have reached the maximum number of attempts for this question.",
      );
      return;
    }

    // Clear draft state before evaluation
    setAnswer("");
    sync("");
    setHasStarted(false);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }

    await onSubmitForEvaluation(trimmedAnswer);
  };

  const hasContent = answer.trim().length > 0;
  const wordCount = answer.trim() ? answer.trim().split(/\s+/).length : 0;

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!allowCopyPaste) e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    if (!allowCopyPaste) e.preventDefault();
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    if (!allowCopyPaste) e.preventDefault();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      !allowCopyPaste &&
      (e.ctrlKey || e.metaKey) &&
      (e.key === "c" || e.key === "v" || e.key === "x")
    ) {
      e.preventDefault();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const { allowed, nextValue } = guard(newValue);
    setAnswer(nextValue);
    if (!allowed && textareaRef.current) {
      textareaRef.current.value = nextValue;
      // Post-render write to override mobile IME buffer that may fight back
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.value = nextValue;
        }
      });
    }
  };

  return (
    <div className="relative mt-4 border rounded-xl bg-background shadow-sm">
      {!hasStarted ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <Button onClick={handleStartWriting} disabled={maxAttemptsReached}>
            Start Writing
          </Button>
          {maxAttemptsReached && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Maximum attempts reached.
            </p>
          )}
        </div>
      ) : (
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">
              {allowCopyPaste
                ? "Type your answer below."
                : "Type your answer below. Copy and paste are disabled."}
            </p>
          </div>

          <Textarea
            ref={textareaRef}
            value={answer}
            onChange={handleChange}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onContextMenu={handleContextMenu}
            onKeyDown={handleKeyDown}
            placeholder={
              maxAttemptsReached
                ? "Maximum attempts reached."
                : "Type your answer here..."
            }
            rows={8}
            className="resize-none min-h-[200px] focus-visible:ring-primary"
            disabled={maxAttemptsReached || isEvaluating}
            autoFocus
          />

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
        </div>
      )}

      {isEvaluating && <EvaluatingIndicator />}
    </div>
  );
}
