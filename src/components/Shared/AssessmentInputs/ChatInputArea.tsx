"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Bot } from "lucide-react";
import { parseSSEStream } from "@/lib/sseParser";
import { useInterpolatedPrompts } from "@/hooks/useInterpolatedPrompts";
import { EvaluatingIndicator } from "@/components/Shared/EvaluatingIndicator";
import { useActivityTracking } from "@/hooks/useActivityTracking";
import type { AssessmentInputProps } from "./types";
import { createBulkInputGuard } from "./wordLimitGuards";
import { INTEGRITY_ACCESS_REVOKED_ERROR_CODE } from "@/lib/integrity/constants";
import { showErrorToast, showWarningToast } from "@/lib/toast";

interface ChatMessage {
  id: string;
  role: "student" | "assistant";
  content: string;
}

function formatFullConversation(msgs: ChatMessage[]) {
  return msgs
    .map((m) => {
      const label = m.role === "student" ? "Student" : "Bot";
      return `${label}: ${m.content ?? ""}`;
    })
    .join("\n\n");
}

export function ChatInputArea({
  question,
  language,
  assignmentId,
  submissionId,
  maxAttemptsReached,
  attempts,
  isEvaluating,
  onSubmitForEvaluation,
  onLanguageDisabledChange,
  botPromptConfig,
  maxAttempts,
  sharedContext,
  allowCopyPaste = false,
  onIntegrityAccessRevoked,
  fileSubmissionsContent,
  activityType,
  title,
  studentInstructions,
}: AssessmentInputProps) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [isStarting, setIsStarting] = React.useState(false);
  const [_isSending, setIsSending] = React.useState(false);

  const { systemPrompt, greeting } = useInterpolatedPrompts({
    question,
    language,
    attemptCount: attempts.length,
    botPromptConfig,
    maxAttempts,
    sharedContext,
    fileSubmissionsContent,
    assessmentMode: "text_chat",
    activityType,
    title,
    studentInstructions,
  });

  const { logEvent } = useActivityTracking({
    componentType: "question",
    componentId: assignmentId,
    subComponentId: String(question.order),
  });

  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const messagesContainerRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const activeRequestAbortRef = React.useRef<AbortController | null>(null);
  const restoredFromStorageRef = React.useRef(false);
  /** Browser timer id; avoid NodeJS.Timeout vs number mismatch in client components. */
  const autoFinishTimeoutIdRef = React.useRef<number | null>(null);
  const finishInFlightRef = React.useRef(false);
  const finishHandlerRef = React.useRef<(() => Promise<void>) | null>(null);
  const messagesRef = React.useRef<ChatMessage[]>([]);
  const endConversationRef = React.useRef<{
    reason: "thorough" | "refusal";
  } | null>(null);
  const storageKey = React.useMemo(
    () => `chat-${submissionId}-${question.order}`,
    [submissionId, question.order],
  );

  const hasStarted = messages.length > 0;

  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const clearAutoFinishTimeout = React.useCallback(() => {
    if (autoFinishTimeoutIdRef.current != null) {
      window.clearTimeout(autoFinishTimeoutIdRef.current);
      autoFinishTimeoutIdRef.current = null;
    }
  }, []);

  // Report language-disabled state to the shell
  React.useEffect(() => {
    onLanguageDisabledChange?.(hasStarted);
  }, [hasStarted, onLanguageDisabledChange]);

  React.useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages]);

  React.useEffect(() => {
    if (hasStarted) textareaRef.current?.focus();
  }, [messages.length, hasStarted]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      !allowCopyPaste &&
      (e.ctrlKey || e.metaKey) &&
      (e.key === "c" || e.key === "v" || e.key === "x")
    ) {
      e.preventDefault();
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim()) handleSend();
    }
  };

  const { guard, sync } = React.useMemo(
    () => createBulkInputGuard(submissionId),
    [submissionId],
  );

  // Load draft for this question, reset ref state, clear stale auto-finish timers
  React.useEffect(() => {
    clearAutoFinishTimeout();
    restoredFromStorageRef.current = false;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          restoredFromStorageRef.current = true;
          setMessages(parsed);
          return;
        }
      }
    } catch {
      /* ignore */
    }
    setMessages([]);
    return () => {
      clearAutoFinishTimeout();
    };
  }, [storageKey, clearAutoFinishTimeout]);

  // Persist chat draft to localStorage
  React.useEffect(() => {
    if (messages.length === 0) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      /* ignore */
    }
  }, [messages, storageKey]);

  const streamSSEResponse = async (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    assistantId: string,
  ): Promise<string> => {
    let content = "";
    endConversationRef.current = null;
    for await (const event of parseSSEStream(reader)) {
      switch (event.type) {
        case "text-delta":
          content += event.content;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content } : m)),
          );
          break;
        case "end_conversation":
          endConversationRef.current = { reason: event.reason };
          break;
        case "error":
          console.error("SSE stream error:", event.error);
          break;
        case "done":
          break;
      }
    }
    return content;
  };

  const _aggregateStudentAnswer = () => {
    return messages
      .filter((m) => m.role === "student")
      .map((m) => m.content)
      .join("\n\n");
  };

  const scheduleEndConversationAutoFinish = React.useCallback(() => {
    clearAutoFinishTimeout();
    autoFinishTimeoutIdRef.current = window.setTimeout(() => {
      autoFinishTimeoutIdRef.current = null;
      void finishHandlerRef.current?.();
    }, 1000);
  }, [clearAutoFinishTimeout]);

  const handleFinishAndEvaluate = React.useCallback(async () => {
    if (finishInFlightRef.current || isEvaluating) {
      return;
    }

    const msgs = messagesRef.current;
    const hasStudentMessage = msgs.some(
      (m) => m.role === "student" && (m.content?.trim() ?? "") !== "",
    );
    if (!hasStudentMessage) {
      if (!isEvaluating && !finishInFlightRef.current) {
        showWarningToast("Please provide at least one response before finishing.");
      }
      return;
    }
    if (maxAttemptsReached) {
      showWarningToast(
        "You have reached the maximum number of attempts for this question.",
      );
      return;
    }

    clearAutoFinishTimeout();

    const answerText = formatFullConversation(msgs).trim();
    finishInFlightRef.current = true;
    try {
      await onSubmitForEvaluation(answerText);
      setMessages([]);
      setInput("");
      sync("");
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
    } catch {
      /* Error toast already shown by AssessmentShell */
    } finally {
      finishInFlightRef.current = false;
    }
  }, [
    clearAutoFinishTimeout,
    isEvaluating,
    maxAttemptsReached,
    onSubmitForEvaluation,
    storageKey,
    sync,
  ]);

  finishHandlerRef.current = handleFinishAndEvaluate;

  const handleStartChat = async () => {
    if (maxAttemptsReached) {
      showWarningToast(
        "You have reached the maximum number of attempts for this question.",
      );
      return;
    }
    setIsStarting(true);
    try {
      if (messages.length > 0) {
        setIsStarting(false);
        return;
      }
      if (activeRequestAbortRef.current) {
        activeRequestAbortRef.current.abort();
        activeRequestAbortRef.current = null;
      }

      const attemptNumber = attempts.length + 1;
      const assistantId = crypto.randomUUID();
      setMessages([{ id: assistantId, role: "assistant", content: "" }]);

      const controller = new AbortController();
      activeRequestAbortRef.current = controller;

      const response = await fetch("/api/chat-assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId,
          submissionId,
          questionOrder: question.order,
          attemptNumber,
          messages: [],
          system_prompt: systemPrompt,
          greeting,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        setMessages([]);
        const errorData = (await response.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        if (
          response.status === 403 &&
          errorData.code === INTEGRITY_ACCESS_REVOKED_ERROR_CODE
        ) {
          onIntegrityAccessRevoked?.();
          showErrorToast(
            errorData.error ||
              "Access to this assessment has been suspended.",
          );
          return;
        }
        throw new Error(errorData.error || "Failed to start chat");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");
      await streamSSEResponse(reader, assistantId);
      logEvent("attempt_started");
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);

      if (endConversationRef.current) {
        scheduleEndConversationAutoFinish();
      }
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === "AbortError" ||
          error.message === "The operation was aborted.")
      ) {
        // aborted
      } else {
        console.error("Error starting chat:", error);
        showErrorToast(
          `Failed to start chat: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        setMessages([]);
      }
    } finally {
      setIsStarting(false);
      activeRequestAbortRef.current = null;
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (maxAttemptsReached) {
      showWarningToast(
        "You have reached the maximum number of attempts for this question.",
      );
      return;
    }
    if (activeRequestAbortRef.current) {
      activeRequestAbortRef.current.abort();
      activeRequestAbortRef.current = null;
    }

    const attemptNumber = attempts.length + 1;
    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "student",
      content: trimmed,
    };
    const nextMessages = [...messages, newMessage];
    setMessages(nextMessages);
    setInput("");
    sync("");

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    setIsSending(true);
    const controller = new AbortController();
    activeRequestAbortRef.current = controller;
    try {
      const response = await fetch("/api/chat-assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId,
          submissionId,
          questionOrder: question.order,
          attemptNumber,
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          system_prompt: systemPrompt,
          greeting,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        const errorData = (await response.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        if (
          response.status === 403 &&
          errorData.code === INTEGRITY_ACCESS_REVOKED_ERROR_CODE
        ) {
          onIntegrityAccessRevoked?.();
          showErrorToast(
            errorData.error ||
              "Access to this assessment has been suspended.",
          );
          return;
        }
        throw new Error(errorData.error || "Failed to send message");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");
      await streamSSEResponse(reader, assistantId);

      if (endConversationRef.current) {
        scheduleEndConversationAutoFinish();
      }
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === "AbortError" ||
          error.message === "The operation was aborted.")
      ) {
        // aborted by user
      } else {
        console.error("Error sending chat message:", error);
        showErrorToast(
          `Failed to send message: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      }
    } finally {
      setIsSending(false);
      activeRequestAbortRef.current = null;
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!allowCopyPaste) e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    if (!allowCopyPaste) e.preventDefault();
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    if (!allowCopyPaste) e.preventDefault();
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const { allowed, nextValue } = guard(newValue);
    setInput(nextValue);
    if (!allowed && textareaRef.current) {
      textareaRef.current.value = nextValue;
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
            <Bot className="h-6 w-6 text-primary" />
          </div>
          <p className="mb-4 text-sm text-muted-foreground text-center max-w-md">
            Begin a conversation with Konvo, the AI teacher assistant, to answer
            this question.
          </p>
          <Button
            onClick={handleStartChat}
            disabled={isStarting || maxAttemptsReached}
          >
            {isStarting ? "Starting..." : "Start Chat"}
          </Button>
          {maxAttemptsReached && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Maximum attempts reached.
            </p>
          )}
        </div>
      ) : (
        <>
          <div
            ref={messagesContainerRef}
            className="h-96 overflow-y-auto py-4 px-2 bg-muted/20"
          >
            <div className="min-h-full flex flex-col justify-end gap-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex items-end gap-2 ${
                  message.role === "student" ? "flex-row-reverse" : "flex-row"
                }`}
              >
                <div
                  className={`max-w-[95%] sm:max-w-[75%] px-4 py-2.5 text-sm whitespace-pre-wrap shadow-sm ${
                    message.role === "student"
                      ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md"
                      : "bg-card border border-border text-card-foreground rounded-2xl rounded-bl-md"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="flex items-center gap-1.5 mb-1.5 text-xs font-medium text-muted-foreground">
                      <Bot className="h-3.5 w-3.5 shrink-0" />
                      Konvo
                    </div>
                  )}
                  {message.content || (
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="w-2 h-2 bg-current rounded-full animate-bounce"></span>
                    </span>
                  )}
                </div>
                {message.role === "student" && (
                  <div className="w-8 h-8 flex-shrink-0" />
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="py-4 px-2 border-t bg-background rounded-b-xl">
            <div className="flex flex-col gap-2">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={handleChange}
                onPaste={handlePaste}
                onDrop={handleDrop}
                onContextMenu={handleContextMenu}
                onKeyDown={handleKeyDown}
                placeholder={
                  maxAttemptsReached
                    ? "Maximum attempts reached."
                    : "Type your message... (Enter to send, Shift+Enter for new line)"
                }
                rows={2}
                className="resize-none flex-1 min-h-[60px] max-h-32 w-full"
                disabled={maxAttemptsReached}
              />
              <Button
                type="button"
                size="icon"
                onClick={handleSend}
                disabled={!input.trim() || maxAttemptsReached}
                className="flex-shrink-0 self-end py-2 px-10"
              >
                Send
              </Button>
            </div>
            <hr className="my-4" />
            <div className="flex justify-center mt-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleFinishAndEvaluate}
                disabled={isEvaluating || !hasStarted || maxAttemptsReached}
              >
                {isEvaluating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Evaluating...
                  </>
                ) : (
                  "Finish & Evaluate"
                )}
              </Button>
            </div>
          </div>
        </>
      )}

      {isEvaluating && <EvaluatingIndicator />}
    </div>
  );
}
