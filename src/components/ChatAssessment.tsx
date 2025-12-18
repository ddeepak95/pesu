"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Bot, Send } from "lucide-react";
import { Question } from "@/types/assignment";
import { SubmissionAttempt } from "@/types/submission";
import { supportedLanguages } from "@/utils/supportedLanguages";
import { getQuestionAttempts } from "@/lib/queries/submissions";

interface ChatMessage {
  id: string;
  role: "student" | "assistant";
  content: string;
}

interface ChatAssessmentProps {
  question: Question;
  language: string;
  assignmentId: string;
  submissionId: string;
  questionNumber: number;
  totalQuestions: number;
  onAnswerSave: (answer: string) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onSubmit?: () => void;
  isFirstQuestion: boolean;
  isLastQuestion: boolean;
  existingAnswer?: string;
  onLanguageChange?: (language: string) => void;
}

export function ChatAssessment({
  question,
  language,
  assignmentId,
  submissionId,
  questionNumber,
  totalQuestions,
  onAnswerSave,
  onPrevious,
  onNext,
  onSubmit,
  isFirstQuestion,
  isLastQuestion,
  existingAnswer,
  onLanguageChange,
}: ChatAssessmentProps) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [isStarting, setIsStarting] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);
  const [isEvaluating, setIsEvaluating] = React.useState(false);
  const [attempts, setAttempts] = React.useState<SubmissionAttempt[]>([]);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const messagesContainerRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const activeRequestAbortRef = React.useRef<AbortController | null>(null);
  const restoredFromStorageRef = React.useRef(false);
  const storageKey = React.useMemo(
    () => `chat-${submissionId}-${question.order}`,
    [submissionId, question.order]
  );

  // Auto-scroll to bottom of chat container whenever messages update
  // (including streaming updates where message count stays the same).
  React.useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // Keep cursor in the textbox whenever chat is active
  React.useEffect(() => {
    if (hasStarted) {
      textareaRef.current?.focus();
    }
  }, [/* eslint-disable-line react-hooks/exhaustive-deps */ messages.length]);

  // Handle Enter key to send message (Shift+Enter for new line)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim()) {
        handleSend();
      }
    }
  };

  // Restore any in-progress chat from localStorage (runs once per question)
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          restoredFromStorageRef.current = true;
          setMessages(parsed);
        }
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
          question.order
        );
        setAttempts(questionAttempts);
        // If we already restored from storage, never overwrite that state here.
        // Otherwise, fall back to existingAnswer (if any), or empty chat.
        if (!restoredFromStorageRef.current) {
          if (existingAnswer && questionAttempts.length === 0) {
            hydrateMessagesFromAnswer(existingAnswer);
          } else {
            setMessages([]);
          }
        }
      } catch (error) {
        console.error("Error loading attempts for chat assessment:", error);
        // On error, fall back to existingAnswer if available and not already
        // restored from storage
        if (!restoredFromStorageRef.current) {
          if (existingAnswer) {
            hydrateMessagesFromAnswer(existingAnswer);
          } else {
            setMessages([]);
          }
        }
      }
    }

    loadAttempts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.order, submissionId, storageKey, existingAnswer]);

  // Persist chat draft to localStorage so it survives refresh while in progress
  React.useEffect(() => {
    // Do not store empty state
    if (messages.length === 0) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      // ignore storage errors
    }
  }, [messages, storageKey]);

  const hydrateMessagesFromAnswer = (answerText: string) => {
    if (!answerText) {
      setMessages([]);
      return;
    }
    setMessages([
      {
        id: "assistant-initial",
        role: "assistant",
        content:
          "Here is a summary of your previous response. You can review it below and try again if you like:",
      },
      {
        id: "student-existing",
        role: "student",
        content: answerText,
      },
    ]);
  };

  const handleStartChat = async () => {
    setIsStarting(true);
    try {
      // If there is already an in-progress conversation (e.g., restored from storage),
      // don't restart the chat.
      if (messages.length > 0) {
        setIsStarting(false);
        return;
      }

      // Abort any existing streaming request
      if (activeRequestAbortRef.current) {
        activeRequestAbortRef.current.abort();
        activeRequestAbortRef.current = null;
      }

      // Determine attempt number for this chat session
      const attemptNumber = attempts.length + 1;

      // Create placeholder assistant bubble for the streaming first message
      const assistantId = crypto.randomUUID();
      setMessages([
        {
          id: assistantId,
          role: "assistant",
          content: "",
        },
      ]);

      const controller = new AbortController();
      activeRequestAbortRef.current = controller;

      const response = await fetch("/api/chat-assessment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assignmentId,
          submissionId,
          questionOrder: question.order,
          questionPrompt: question.prompt,
          rubric: question.rubric,
          language,
          attemptNumber,
          // No prior messages – this will generate the first assistant message
          messages: [],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        setMessages([]);
        const errorData = await response.json().catch(() => ({}));
        console.error("Chat API error (start chat):", errorData);
        throw new Error(errorData.error || "Failed to start chat");
      }

      // Stream the first assistant message
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let content = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        content += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content } : m))
        );
      }

      // Ensure input has focus once the first reply has appeared
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === "AbortError" ||
          error.message === "The operation was aborted.")
      ) {
        console.warn("Start chat request aborted by user");
      } else {
        console.error("Error starting chat:", error);
        alert(
          `Failed to start chat: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
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

    // If a previous response is streaming, abort it so the user can interrupt
    if (activeRequestAbortRef.current) {
      activeRequestAbortRef.current.abort();
      activeRequestAbortRef.current = null;
    }

    // Determine the attempt number for this chat session.
    // It is always the next attempt after any completed ones.
    const attemptNumber = attempts.length + 1;

    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "student",
      content: trimmed,
    };

    const nextMessages = [...messages, newMessage];
    setMessages(nextMessages);
    setInput("");

    // Create placeholder for assistant response
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assignmentId,
          submissionId,
          questionOrder: question.order,
          questionPrompt: question.prompt,
          rubric: question.rubric,
          language,
          attemptNumber,
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Remove placeholder on error
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        const errorData = await response.json().catch(() => ({}));
        console.error("Chat API error:", errorData);
        throw new Error(errorData.error || "Failed to send message");
      }

      // Stream the response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let content = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        content += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content } : m))
        );
      }
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === "AbortError" ||
          error.message === "The operation was aborted.")
      ) {
        // Aborted due to user interrupt; keep whatever content streamed so far
        console.warn("Chat request aborted by user");
      } else {
        console.error("Error sending chat message:", error);
        alert(
          `Failed to send message: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
        // On hard error, remove the placeholder assistant bubble
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      }
    } finally {
      setIsSending(false);
      activeRequestAbortRef.current = null;
      // Refocus the textarea after sending / interruption
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    }
  };

  const aggregateStudentAnswer = () => {
    const studentMessages = messages.filter((m) => m.role === "student");
    return studentMessages.map((m) => m.content).join("\n\n");
  };

  const handleEvaluate = async () => {
    const answerText = aggregateStudentAnswer().trim();
    if (!answerText) {
      alert("Please provide at least one response before finishing.");
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
          answerText,
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
      onAnswerSave(answerText);

      // After an evaluated attempt, reset the chat so the student
      // sees the Start Chat button again for a fresh conversation
      // and clear any stored draft for this question.
      setMessages([]);
      setInput("");
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // ignore storage errors
      }
    } catch (error) {
      console.error("Error evaluating chat answer:", error);
      alert(
        `Failed to evaluate your answer: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleSaveAndNavigate = (action: "previous" | "next" | "submit") => {
    const answerText = aggregateStudentAnswer().trim();
    if (answerText) {
      onAnswerSave(answerText);
    }

    if (action === "previous" && onPrevious) {
      onPrevious();
    } else if (action === "next" && onNext) {
      onNext();
    } else if (action === "submit" && onSubmit) {
      onSubmit();
    }
  };

  const hasStarted = messages.length > 0;

  return (
    <div className="space-y-6">
      {/* Question Number and Language Selector */}
      <div className="flex items-center justify-between">
        <p className="text-lg font-medium">
          Question ({questionNumber}/{totalQuestions})
        </p>

        {onLanguageChange && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Language:</span>
            <Select
              value={language}
              onValueChange={onLanguageChange}
              disabled={hasStarted}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {supportedLanguages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Question Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Prompt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-wrap">{question.prompt}</p>

          {/* View Rubric Accordion */}
          {question.rubric && question.rubric.length > 0 && (
            <Accordion type="single" collapsible>
              <AccordionItem value="rubric">
                <AccordionTrigger>View Rubric</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2">
                    {question.rubric.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between items-start gap-4 p-3 bg-muted/50 rounded-md"
                      >
                        <span className="flex-1">{item.item}</span>
                        <span className="font-semibold text-sm whitespace-nowrap">
                          {item.points} pts
                        </span>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

          {/* Chat Area */}
          <div className="mt-4 border rounded-xl bg-background shadow-sm">
            {!hasStarted ? (
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Bot className="h-6 w-6 text-primary" />
                </div>
                <p className="mb-4 text-sm text-muted-foreground text-center max-w-md">
                  Click &quot;Start Chat&quot; to begin a conversation with the
                  tutor about this question. You can type your answer and get
                  feedback step by step.
                </p>
                <Button onClick={handleStartChat} disabled={isStarting}>
                  {isStarting ? "Starting..." : "Start Chat"}
                </Button>
              </div>
            ) : (
              <>
                {/* Messages Container */}
                <div
                  ref={messagesContainerRef}
                  className="h-96 overflow-y-auto p-4 space-y-4 bg-muted/20"
                >
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex items-end gap-2 ${
                        message.role === "student"
                          ? "flex-row-reverse"
                          : "flex-row"
                      }`}
                    >
                      {/* Avatar */}
                      {message.role === "assistant" && (
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                      )}

                      {/* Message Bubble */}
                      <div
                        className={`max-w-[75%] px-4 py-2.5 text-sm whitespace-pre-wrap shadow-sm ${
                          message.role === "student"
                            ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md"
                            : "bg-card border border-border text-card-foreground rounded-2xl rounded-bl-md"
                        }`}
                      >
                        {message.content || (
                          <span className="inline-flex items-center gap-1">
                            <span className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                            <span className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                            <span className="w-2 h-2 bg-current rounded-full animate-bounce"></span>
                          </span>
                        )}
                      </div>

                      {/* Student Avatar Placeholder (for alignment) */}
                      {message.role === "student" && (
                        <div className="w-8 h-8 flex-shrink-0" />
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 border-t bg-background rounded-b-xl">
                  <div className="flex gap-2 items-end">
                    <Textarea
                      ref={textareaRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
                      rows={2}
                      className="resize-none flex-1 min-h-[60px] max-h-32"
                    />
                    <Button
                      type="button"
                      size="icon"
                      onClick={handleSend}
                      disabled={!input.trim()}
                      className="h-10 w-10 flex-shrink-0"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex justify-end mt-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleEvaluate}
                      disabled={isEvaluating || !hasStarted}
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
          </div>

          {/* Evaluating State */}
          {isEvaluating && (
            <div className="mt-4 p-4 border rounded-md text-center">
              <Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" />
              <p className="text-xs mt-1">
                Please wait while we evaluate your answer. This takes up to a
                minute.
              </p>
            </div>
          )}

          {/* Attempts Section */}
          {attempts.length > 0 && (
            <div className="mt-4 border rounded-lg">
              <div className="p-3 bg-muted/30 border-b">
                <p className="text-sm font-semibold">Attempts</p>
              </div>
              <Accordion type="single" collapsible className="w-full">
                {attempts.map((attempt) => {
                  const scorePercentage =
                    (attempt.score / attempt.max_score) * 100;
                  const getScoreColor = (percentage: number) => {
                    if (percentage >= 75)
                      return "text-green-600 dark:text-green-400";
                    if (percentage >= 50)
                      return "text-yellow-600 dark:text-yellow-400";
                    return "text-red-600 dark:text-red-400";
                  };

                  return (
                    <AccordionItem
                      key={attempt.attempt_number}
                      value={`attempt-${attempt.attempt_number}`}
                      className="border-b last:border-b-0"
                    >
                      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
                        <div className="flex items-center justify-between w-full pr-2">
                          <span className="text-sm font-medium">
                            Attempt {attempt.attempt_number}
                          </span>
                          <span
                            className={`text-sm font-semibold ${getScoreColor(
                              scorePercentage
                            )}`}
                          >
                            {attempt.score}/{attempt.max_score}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4">
                        {/* Overall Feedback */}
                        {attempt.evaluation_feedback && (
                          <div className="mb-4 p-3 bg-muted/50 rounded-md">
                            <p className="text-xs font-semibold mb-2">
                              Overall Feedback:
                            </p>
                            <p className="text-sm whitespace-pre-wrap">
                              {attempt.evaluation_feedback}
                            </p>
                          </div>
                        )}

                        {/* Rubric Breakdown */}
                        {attempt.rubric_scores &&
                          attempt.rubric_scores.length > 0 && (
                            <div className="space-y-2 mb-4">
                              <p className="text-xs font-semibold">
                                Rubric Breakdown:
                              </p>
                              {attempt.rubric_scores.map((rubricItem, idx) => {
                                const itemPercentage =
                                  (rubricItem.points_earned /
                                    rubricItem.points_possible) *
                                  100;
                                return (
                                  <div
                                    key={idx}
                                    className="p-2 bg-muted/30 rounded-md space-y-1"
                                  >
                                    <div className="flex justify-between items-center">
                                      <span className="text-sm font-medium">
                                        {rubricItem.item}
                                      </span>
                                      <span
                                        className={`text-sm font-semibold ${
                                          itemPercentage >= 75
                                            ? "text-green-600 dark:text-green-400"
                                            : itemPercentage >= 50
                                            ? "text-yellow-600 dark:text-yellow-400"
                                            : "text-red-600 dark:text-red-400"
                                        }`}
                                      >
                                        {rubricItem.points_earned}/
                                        {rubricItem.points_possible} pts
                                      </span>
                                    </div>
                                    {rubricItem.feedback && (
                                      <p className="text-xs text-muted-foreground">
                                        {rubricItem.feedback}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                        {/* Timestamp */}
                        <div className="text-xs text-muted-foreground">
                          {new Date(attempt.timestamp).toLocaleString()}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex justify-between gap-4">
        <Button
          onClick={() => handleSaveAndNavigate("previous")}
          disabled={isFirstQuestion}
          variant="outline"
          size="lg"
        >
          Previous Question
        </Button>

        <div className="flex gap-4">
          {!isLastQuestion && (
            <Button onClick={() => handleSaveAndNavigate("next")} size="lg">
              Next Question
            </Button>
          )}
          {isLastQuestion && (
            <Button
              onClick={() => handleSaveAndNavigate("submit")}
              size="lg"
              variant="default"
            >
              Submit Assignment
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
