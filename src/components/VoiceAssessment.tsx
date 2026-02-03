"use client";
import React, { useMemo } from "react";
import { VoiceClient } from "@/components/VoiceClient";
import { VoiceConnectButton } from "@/components/VoiceConnectButton";
import { AgentStatus } from "@/components/AgentStatus";
import {
  VoiceAssessmentProvider,
  useVoiceTranscript,
} from "@/contexts/VoiceAssessmentContext";
import { Question, BotPromptConfig } from "@/types/assignment";
import { SubmissionAttempt } from "@/types/submission";
import { interpolatePromptsForRuntime } from "@/lib/promptInterpolation";
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
import { useActivityTracking } from "@/hooks/useActivityTracking";

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
  // Bot prompt configuration for custom prompts
  botPromptConfig?: BotPromptConfig;
  // For marking as complete
  contentItemId?: string | null;
  // Display settings
  studentInstructions?: string;
  showRubric?: boolean;
  showRubricPoints?: boolean;
  useStarDisplay?: boolean;
  starScale?: number;
  // Note: classId and userId for activity tracking are provided via ActivityTrackingContext
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
  maxAttempts,
  maxAttemptsReached,
  botPromptConfig,
  contentItemId,
  studentInstructions,
  showRubric = true,
  showRubricPoints = true,
  useStarDisplay = false,
  starScale = 5,
}: VoiceAssessmentProps) {
  const { transcript, clearTranscript, setTranscript } = useVoiceTranscript();
  const client = usePipecatClient();
  const transportState = usePipecatClientTransportState();
  const isConnected = ["connected", "ready"].includes(transportState);

  const [isEvaluating, setIsEvaluating] = React.useState(false);
  const [attempts, setAttempts] = React.useState<SubmissionAttempt[]>([]);
  const evaluationTriggeredRef = React.useRef(false);

  // Activity tracking for question-level time
  // Uses ActivityTrackingContext for userId, classId, submissionId
  const { logEvent } = useActivityTracking({
    componentType: "question",
    componentId: assignmentId,
    subComponentId: String(question.order),
  });

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
          question.order,
          true // Exclude stale attempts
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
      alert(
        "You have reached the maximum number of attempts for this question."
      );
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

      // Log attempt_ended event
      logEvent("attempt_ended");

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

  // Handle automatic disconnection when backend terminates (via EndTaskFrame/EndFrame)
  // When bot disconnects, we disconnect the client and trigger evaluation
  React.useEffect(() => {
    if (!client) return;

    const handleBotDisconnected = async () => {
      console.log(
        "Bot disconnected event received (backend terminated conversation)"
      );

      // Prevent double-evaluation
      if (evaluationTriggeredRef.current) {
        console.log("Evaluation already triggered, skipping");
        return;
      }

      try {
        // Disconnect the client to update UI state
        if (isConnected) {
          await client.disconnect();
          console.log("Client disconnected after bot termination");
        }

        // Trigger evaluation after a brief delay to ensure disconnection completes
        // Only evaluate if we have a transcript and aren't already evaluating
        if (transcript.trim() && !isEvaluating) {
          evaluationTriggeredRef.current = true;
          // Small delay to ensure state updates complete
          setTimeout(() => {
            console.log("Triggering evaluation after bot disconnection");
            handleEvaluate();
          }, 300);
        }
      } catch (error) {
        console.error("Error handling bot disconnection:", error);
      }
    };

    // Listen for botDisconnected event (fires when backend sends EndTaskFrame/EndFrame)
    client.on("botDisconnected", handleBotDisconnected);

    return () => {
      client.off("botDisconnected", handleBotDisconnected);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, isConnected, transcript, isEvaluating]);

  // Also watch transport state changes as a backup
  const prevTransportStateRef = React.useRef(transportState);
  React.useEffect(() => {
    const prevState = prevTransportStateRef.current;
    prevTransportStateRef.current = transportState;

    // Check if we transitioned from connected/ready to disconnected
    // This happens when the backend sends EndTaskFrame and terminates the conversation
    // Note: This is a backup - botDisconnected handler should handle evaluation
    if (
      (prevState === "connected" || prevState === "ready") &&
      transportState === "disconnected"
    ) {
      console.log("Transport state changed to disconnected");
      // Only evaluate if botDisconnected handler didn't already trigger it
      if (
        transcript.trim() &&
        !isEvaluating &&
        !evaluationTriggeredRef.current
      ) {
        evaluationTriggeredRef.current = true;
        console.log(
          "Triggering evaluation via transport state change (backup)"
        );
        handleEvaluate();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transportState, transcript, isEvaluating]);

  // Interpolate prompts if botPromptConfig is provided
  const interpolatedPrompts = useMemo(() => {
    if (!botPromptConfig) return null;

    // Build a minimal assignment object for interpolation
    const assignmentForInterpolation = {
      questions: [question], // Current question
      max_attempts: maxAttempts || 1,
      bot_prompt_config: botPromptConfig,
    };

    return interpolatePromptsForRuntime(
      assignmentForInterpolation as Parameters<
        typeof interpolatePromptsForRuntime
      >[0],
      question,
      language,
      attempts.length + 1
    );
  }, [botPromptConfig, question, language, maxAttempts, attempts.length]);

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
    // Only pass supabase_env if explicitly set - prevents accidental dev/prod mismatch
    ...(process.env.NEXT_PUBLIC_SUPABASE_ENV && {
      supabase_env: process.env.NEXT_PUBLIC_SUPABASE_ENV,
    }),
    // Include interpolated prompts if available (new bot prompt config)
    ...(interpolatedPrompts && {
      system_prompt: interpolatedPrompts.system_prompt,
      greeting: interpolatedPrompts.greeting,
    }),
  };

  const handleBotReady = () => {
    console.log("Bot is ready for conversation");
    // Clear transcript when starting new attempt
    // Audio recording is handled server-side by Pipecat's AudioBufferProcessor
    clearTranscript();
    // Reset evaluation trigger flag for new conversation
    evaluationTriggeredRef.current = false;
    // Log attempt_started event
    logEvent("attempt_started");
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

      <AssessmentQuestionCard
        question={question}
        studentInstructions={studentInstructions}
        showRubric={showRubric}
        showRubricPoints={showRubricPoints}
      >
        {/* Agent Status Display */}
        <AgentStatus className="py-2" />

        {/* Voice Visualizer */}
        <div className="flex justify-center py-4">
          <VoiceVisualizer participantType="bot" barColor="currentColor" />
        </div>

        <div className="flex flex-col items-center gap-2">
          <VoiceConnectButton
            connectionData={connectionData}
            connectLabel={attempts.length > 0 ? "Try Again" : "Start Answering"}
            disconnectLabel="Stop Answering"
            onBotReady={handleBotReady}
            onDisconnect={handleEvaluate}
            disabled={maxAttemptsReached}
          />
          {maxAttemptsReached && (
            <p className="text-xs text-muted-foreground text-center">
              Maximum attempts reached. You can view your previous attempts
              below.
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
          useStarDisplay={useStarDisplay}
          starScale={starScale}
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
        contentItemId={contentItemId}
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
