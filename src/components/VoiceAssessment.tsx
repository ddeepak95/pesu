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
import { VoiceClient } from "@/components/VoiceClient";
import { VoiceConnectButton } from "@/components/VoiceConnectButton";
import { AgentStatus } from "@/components/AgentStatus";
import {
  VoiceAssessmentProvider,
  useVoiceTranscript,
} from "@/contexts/VoiceAssessmentContext";
import { Question } from "@/types/assignment";
import { SubmissionAttempt } from "@/types/submission";
import {
  usePipecatClient,
  usePipecatClientTransportState,
} from "@pipecat-ai/client-react";
import { VoiceVisualizer } from "@pipecat-ai/voice-ui-kit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supportedLanguages } from "@/utils/supportedLanguages";
import { getQuestionAttempts } from "@/lib/queries/submissions";

interface VoiceAssessmentProps {
  question: Question;
  language: string;
  assignmentId: string;
  submissionId: string;
  questionNumber: number;
  totalQuestions: number;
  onAnswerSave: (transcript: string) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onSubmit?: () => void;
  isFirstQuestion: boolean;
  isLastQuestion: boolean;
  existingAnswer?: string;
  onLanguageChange?: (language: string) => void;
}

/**
 * Internal component that uses the voice transcript hook
 */
function VoiceAssessmentContent({
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
}: VoiceAssessmentProps) {
  const { transcript, clearTranscript, setTranscript } = useVoiceTranscript();
  const client = usePipecatClient();
  const transportState = usePipecatClientTransportState();
  const isConnected = ["connected", "ready"].includes(transportState);

  const [conversationStarted, setConversationStarted] = React.useState(false);
  const [isEvaluating, setIsEvaluating] = React.useState(false);
  const [attempts, setAttempts] = React.useState<SubmissionAttempt[]>([]);

  // Load existing attempts when question changes
  React.useEffect(() => {
    async function loadAttempts() {
      try {
        const questionAttempts = await getQuestionAttempts(
          submissionId,
          question.order
        );
        setAttempts(questionAttempts);

        // Load transcript from latest attempt if exists
        if (questionAttempts.length > 0) {
          const latestAttempt = questionAttempts[questionAttempts.length - 1];
          setTranscript(latestAttempt.answer_text);
        } else if (existingAnswer) {
          setTranscript(existingAnswer);
        } else {
          clearTranscript();
        }
      } catch (error) {
        console.error("Error loading attempts:", error);
        // Fallback to existing answer if available
        if (existingAnswer) {
          setTranscript(existingAnswer);
        } else {
          clearTranscript();
        }
      }
    }

    loadAttempts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.order, submissionId]);

  // Disconnect when question changes (each question gets fresh connection)
  React.useEffect(() => {
    return () => {
      if (client && isConnected) {
        console.log("Question changing, disconnecting current session...");
        client.disconnect().catch(console.error);
      }
    };
  }, [question.order, client, isConnected]);

  const handleSaveAndNavigate = (action: "previous" | "next" | "submit") => {
    // Save current transcript if it exists
    if (transcript.trim()) {
      onAnswerSave(transcript.trim());
    }

    // Navigate based on action (useEffect will handle loading the next question's answer)
    if (action === "previous" && onPrevious) {
      onPrevious();
    } else if (action === "next" && onNext) {
      onNext();
    } else if (action === "submit" && onSubmit) {
      onSubmit();
    }
  };

  // Handle evaluation after disconnect
  const handleEvaluate = async () => {
    console.log("=== Starting evaluation ===");
    console.log("Transcript:", transcript);
    console.log("Transcript length:", transcript.trim().length);
    
    if (!transcript.trim()) {
      console.warn("No transcript to evaluate");
      alert("No answer recorded. Please try speaking your answer again.");
      return;
    }

    setIsEvaluating(true);

    try {
      console.log("Calling evaluation API with:", {
        submissionId,
        questionOrder: question.order,
        answerTextLength: transcript.trim().length,
        rubricItems: question.rubric?.length,
        language,
      });

      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          submissionId,
          questionOrder: question.order,
          answerText: transcript.trim(),
          questionPrompt: question.prompt,
          rubric: question.rubric,
          language: language, // Pass user's selected language for feedback
        }),
      });

      console.log("API Response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("API Error:", errorData);
        throw new Error(errorData.error || "Evaluation failed");
      }

      const result = await response.json();
      console.log("Evaluation result:", result);
      
      const newAttempt = result.attempt as SubmissionAttempt;

      if (!newAttempt) {
        throw new Error("No attempt data received from API");
      }

      console.log("Setting evaluation:", newAttempt);
      setAttempts((prev) => [...prev, newAttempt]);

      // Note: Evaluation API already saved the attempt to database
      // No need to call onAnswerSave here
      
      console.log("=== Evaluation complete ===");
    } catch (error) {
      console.error("Error evaluating answer:", error);
      alert(
        `Failed to evaluate your answer: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsEvaluating(false);
    }
  };


  // Prepare connection data to send to server (only used for initial connection)
  const connectionData = {
    language,
    question_prompt: question.prompt,
    rubric: question.rubric,
    assignment_id: assignmentId,
    question_order: question.order,
  };

  const handleBotReady = () => {
    console.log("Bot is ready for conversation");
    setConversationStarted(true);
    // Clear transcript when starting new attempt
    clearTranscript();
  };

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
              disabled={isConnected}
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

          {/* Agent Status Display */}
          <AgentStatus className="py-2" />

          {/* Voice Visualizer */}
          <div className="flex justify-center py-4">
            <VoiceVisualizer participantType="bot" barColor="currentColor" />
          </div>

          <div className="flex justify-center">
            <VoiceConnectButton
              connectionData={connectionData}
              connectLabel={attempts.length > 0 ? "Try Again" : "Start Answering"}
              disconnectLabel="Stop Answering"
              onBotReady={handleBotReady}
              onDisconnect={handleEvaluate}
            />
          </div>

          {/* Evaluating State */}
          {isEvaluating && (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/30 rounded-md text-center">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                Getting feedback...
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                Please wait while we evaluate your answer
              </p>
            </div>
          )}

          {/* Transcript Display (when recording/not evaluated yet) */}
          {transcript && !isEvaluating && attempts.length === 0 && (
            <div className="mt-4 p-4 bg-muted/50 rounded-md max-h-96 overflow-y-auto">
              <p className="text-sm font-semibold mb-2">Conversation:</p>
              <div className="text-sm whitespace-pre-wrap">{transcript}</div>
            </div>
          )}

          {/* Attempts Section - Shows all attempts as accordions */}
          {attempts.length > 0 && !isEvaluating && (
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
          disabled={isFirstQuestion || isConnected || isEvaluating}
          variant="outline"
          size="lg"
        >
          Previous Question
        </Button>

        <div className="flex gap-4">
          {!isLastQuestion && (
            <Button
              onClick={() => handleSaveAndNavigate("next")}
              disabled={isConnected || isEvaluating}
              size="lg"
            >
              Next Question
            </Button>
          )}
          {isLastQuestion && (
            <Button
              onClick={() => handleSaveAndNavigate("submit")}
              disabled={isConnected || isEvaluating}
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

/**
 * Main voice assessment component for answering questions via voice
 * Manages voice session for a single question
 */
export function VoiceAssessment(props: VoiceAssessmentProps) {
  return (
    <VoiceClient showVisualizer={false} showTranscript={false}>
      <VoiceAssessmentProvider>
        <VoiceAssessmentContent {...props} />
      </VoiceAssessmentProvider>
    </VoiceClient>
  );
}
