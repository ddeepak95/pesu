"use client";

import * as React from "react";

type EndConversationReason = "thorough" | "refusal";

interface UseEndConversationFinishOptions {
  isEvaluating: boolean;
  maxAttemptsReached?: boolean;
  hasStudentContent: () => boolean;
  onWarnNoStudentContent: () => void;
  onWarnMaxAttemptsReached: () => void;
  onFinish: () => Promise<void>;
}

export function useEndConversationFinish({
  isEvaluating,
  maxAttemptsReached,
  hasStudentContent,
  onWarnNoStudentContent,
  onWarnMaxAttemptsReached,
  onFinish,
}: UseEndConversationFinishOptions) {
  const timeoutRef = React.useRef<number | null>(null);
  const finishInFlightRef = React.useRef(false);
  const endConversationRef = React.useRef<{ reason: EndConversationReason } | null>(
    null,
  );

  const clearAutoFinishTimeout = React.useCallback(() => {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const runFinish = React.useCallback(async () => {
    if (finishInFlightRef.current || isEvaluating) return;
    if (maxAttemptsReached) {
      onWarnMaxAttemptsReached();
      return;
    }
    if (!hasStudentContent()) {
      onWarnNoStudentContent();
      return;
    }
    clearAutoFinishTimeout();
    finishInFlightRef.current = true;
    try {
      await onFinish();
    } finally {
      finishInFlightRef.current = false;
    }
  }, [
    clearAutoFinishTimeout,
    hasStudentContent,
    isEvaluating,
    maxAttemptsReached,
    onFinish,
    onWarnMaxAttemptsReached,
    onWarnNoStudentContent,
  ]);

  const scheduleAutoFinish = React.useCallback(() => {
    clearAutoFinishTimeout();
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      void runFinish();
    }, 1000);
  }, [clearAutoFinishTimeout, runFinish]);

  React.useEffect(() => {
    return () => {
      clearAutoFinishTimeout();
    };
  }, [clearAutoFinishTimeout]);

  return {
    endConversationRef,
    clearAutoFinishTimeout,
    scheduleAutoFinish,
    runFinish,
    finishInFlightRef,
  };
}
