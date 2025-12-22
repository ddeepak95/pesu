"use client";
import React from "react";
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
import { getQuestionAttempts } from "@/lib/queries/submissions";
import { AssessmentQuestionHeader } from "@/components/Shared/AssessmentQuestionHeader";
import { AssessmentQuestionCard } from "@/components/Shared/AssessmentQuestionCard";
import { AttemptsPanel } from "@/components/Shared/AttemptsPanel";
import { AssessmentNavigation } from "@/components/Shared/AssessmentNavigation";
import { EvaluatingIndicator } from "@/components/Shared/EvaluatingIndicator";

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
  isFirstQuestion: boolean;
  isLastQuestion: boolean;
  existingAnswer?: string;
  onLanguageChange?: (language: string) => void;
  currentAttemptNumber?: number;
  maxAttempts?: number;
  maxAttemptsReached?: boolean;
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
  isFirstQuestion,
  isLastQuestion,
  existingAnswer,
  onLanguageChange,
  currentAttemptNumber,
  maxAttempts,
  maxAttemptsReached,
}: VoiceAssessmentProps) {
  const { transcript, clearTranscript, setTranscript } = useVoiceTranscript();
  const client = usePipecatClient();
  const transportState = usePipecatClientTransportState();
  const isConnected = ["connected", "ready"].includes(transportState);

  const [isEvaluating, setIsEvaluating] = React.useState(false);
  const [attempts, setAttempts] = React.useState<SubmissionAttempt[]>([]);

  const transportStateRef = React.useRef(transportState);
  React.useEffect(() => {
    transportStateRef.current = transportState;
  }, [transportState]);
  
  // Load existing attempts when question changes
  React.useEffect(() => {
    // Reset local state before loading
    setAttempts([]);
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
      if (
        client &&
        ["connected", "ready"].includes(transportStateRef.current)
      ) {
        console.log("Question changing, disconnecting current session...");
        client.disconnect().catch(console.error);
      }
    };
  }, [question.order, client]);

  const handleSaveAndNavigate = (action: "previous" | "next") => {
    // Save current transcript if it exists
    if (transcript.trim()) {
      onAnswerSave(transcript.trim());
    }

    // Navigate based on action (useEffect will handle loading the next question's answer)
    if (action === "previous" && onPrevious) {
      onPrevious();
    } else if (action === "next" && onNext) {
      onNext();
    }
  };

  // Handle evaluation after disconnect
  // Note: Audio recording is now handled server-side by Pipecat's AudioBufferProcessor
  const handleEvaluate = async () => {
    // Prevent evaluating if max attempts reached
    if (maxAttemptsReached) {
      alert("You have reached the maximum number of attempts for this question.");
      return;
    }

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
      // Audio recording is handled server-side by Pipecat

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
  // Server-side Pipecat bot handles audio recording via AudioBufferProcessor
  const connectionData = {
    language,
    question_prompt: question.prompt,
    rubric: question.rubric,
    assignment_id: assignmentId,
    question_order: question.order,
    submission_id: submissionId, // For server-side audio recording
    attempt_number: attempts.length + 1, // For server-side audio recording
  };

  const handleBotReady = () => {
    console.log("Bot is ready for conversation");
    // Clear transcript when starting new attempt
    // Audio recording is handled server-side by Pipecat's AudioBufferProcessor
    clearTranscript();
  };

  return (
    <div className="space-y-6">
      <AssessmentQuestionHeader
        questionNumber={questionNumber}
        totalQuestions={totalQuestions}
        language={language}
        onLanguageChange={onLanguageChange}
        languageDisabled={isConnected}
      />

      <AssessmentQuestionCard question={question}>
        {/* Agent Status Display */}
        <AgentStatus className="py-2" />

        {/* Voice Visualizer */}
        <div className="flex justify-center py-4">
          <VoiceVisualizer participantType="bot" barColor="currentColor" />
        </div>

        <div className="flex flex-col items-center gap-2">
          <VoiceConnectButton
            connectionData={connectionData}
            connectLabel={
              attempts.length > 0 ? "Try Again" : "Start Answering"
            }
            disconnectLabel="Stop Answering"
            onBotReady={handleBotReady}
            onDisconnect={handleEvaluate}
            disabled={maxAttemptsReached}
          />
          {maxAttemptsReached && (
            <p className="text-xs text-muted-foreground text-center">
              Maximum attempts reached. You can view your previous attempts below.
            </p>
          )}
        </div>

        {/* Transcript Display (when recording/not evaluated yet) */}
        {transcript && (
          <div className="mt-4 p-4 bg-muted/50 rounded-md max-h-76 overflow-y-auto">
            <div className="text-sm whitespace-pre-wrap">{transcript}</div>
          </div>
        )}

        {/* Evaluating State */}
        {isEvaluating && <EvaluatingIndicator />}

        {/* Attempts Section */}
        <AttemptsPanel
          attempts={attempts}
          maxAttempts={maxAttempts}
          maxAttemptsReached={maxAttemptsReached}
        />
      </AssessmentQuestionCard>

      {/* Navigation Buttons */}
      <AssessmentNavigation
        isFirstQuestion={isFirstQuestion}
        isLastQuestion={isLastQuestion}
        onPrevious={() => handleSaveAndNavigate("previous")}
        onNext={() => handleSaveAndNavigate("next")}
        previousDisabled={isConnected || isEvaluating}
        nextDisabled={isConnected || isEvaluating}
      />
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
