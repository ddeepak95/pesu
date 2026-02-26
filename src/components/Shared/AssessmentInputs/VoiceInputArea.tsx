"use client";

import React, { useMemo } from "react";
import { VoiceClient } from "@/components/VoiceClient";
import { VoiceConnectButton } from "@/components/VoiceConnectButton";
import { AgentStatus } from "@/components/AgentStatus";
import {
  VoiceAssessmentProvider,
  useVoiceTranscript,
} from "@/contexts/VoiceAssessmentContext";
import {
  interpolatePromptsForRuntime,
} from "@/lib/promptInterpolation";
import {
  usePipecatClient,
  usePipecatClientTransportState,
} from "@pipecat-ai/client-react";
import { VoiceVisualizer } from "@pipecat-ai/voice-ui-kit";
import { getLatestTranscript } from "@/lib/queries/submissions";
import { EvaluatingIndicator } from "@/components/Shared/EvaluatingIndicator";
import { EmojiMatchGame } from "@/components/EmojiMatchGame";
import { useActivityTracking } from "@/hooks/useActivityTracking";
import type { AssessmentInputProps } from "./types";

function VoiceInputContent({
  question,
  language,
  assignmentId,
  submissionId,
  existingAnswer,
  maxAttemptsReached,
  attempts,
  isEvaluating,
  onSubmitForEvaluation,
  onLanguageDisabledChange,
  onNavigationDisabledChange,
  botPromptConfig,
  maxAttempts,
  sharedContext,
}: AssessmentInputProps) {
  const { transcript, clearTranscript, setTranscript } = useVoiceTranscript();
  const client = usePipecatClient();
  const transportState = usePipecatClientTransportState();
  const isConnected = ["connected", "ready"].includes(transportState);
  const evaluationTriggeredRef = React.useRef(false);

  const { logEvent } = useActivityTracking({
    componentType: "question",
    componentId: assignmentId,
    subComponentId: String(question.order),
  });

  // Report language-disabled and navigation-disabled state to the shell
  React.useEffect(() => {
    onLanguageDisabledChange?.(isConnected);
  }, [isConnected, onLanguageDisabledChange]);

  React.useEffect(() => {
    onNavigationDisabledChange?.(isConnected);
  }, [isConnected, onNavigationDisabledChange]);

  // Mini-game during extended warm-up
  const isConnecting =
    transportState === "connecting" || transportState === "authenticating";
  const [showGame, setShowGame] = React.useState(false);

  React.useEffect(() => {
    if (!isConnecting) return;
    const timer = setTimeout(() => setShowGame(true), 7000);
    return () => clearTimeout(timer);
  }, [isConnecting]);

  React.useEffect(() => {
    if (!client) return;
    const onBotReady = () => setShowGame(false);
    client.on("botReady", onBotReady);
    return () => { client.off("botReady", onBotReady); };
  }, [client]);

  React.useEffect(() => {
    const notInSession =
      transportState === "error" ||
      transportState === "initializing" ||
      transportState === "initialized" ||
      transportState === "disconnecting";
    if (notInSession) setShowGame(false);
  }, [transportState]);

  const transportStateRef = React.useRef(transportState);
  React.useEffect(() => { transportStateRef.current = transportState; }, [transportState]);

  // Load latest transcript when question changes
  React.useEffect(() => {
    async function loadTranscript() {
      try {
        const latestTranscriptText = await getLatestTranscript(submissionId, question.order);
        if (latestTranscriptText) {
          setTranscript(latestTranscriptText);
        } else if (existingAnswer) {
          setTranscript(existingAnswer);
        } else {
          clearTranscript();
        }
      } catch {
        if (existingAnswer) {
          setTranscript(existingAnswer);
        } else {
          clearTranscript();
        }
      }
    }
    loadTranscript();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.order, submissionId]);

  // Disconnect when question changes
  React.useEffect(() => {
    return () => {
      if (client && ["connected", "ready"].includes(transportStateRef.current)) {
        client.disconnect().catch(console.error);
      }
    };
  }, [question.order, client]);

  const handleEvaluate = async () => {
    logEvent("bot_disconnected");
    if (maxAttemptsReached) {
      alert("You have reached the maximum number of attempts for this question.");
      return;
    }
    if (!transcript.trim()) {
      alert("No answer recorded. Please try speaking your answer again.");
      return;
    }
    await onSubmitForEvaluation(transcript.trim());
  };

  // Bot disconnect -> evaluate
  React.useEffect(() => {
    if (!client) return;
    const handleBotDisconnected = async () => {
      if (evaluationTriggeredRef.current) return;
      try {
        if (isConnected) {
          await client.disconnect();
        }
        if (transcript.trim() && !isEvaluating) {
          evaluationTriggeredRef.current = true;
          setTimeout(() => { handleEvaluate(); }, 300);
        }
      } catch (error) {
        console.error("Error handling bot disconnection:", error);
      }
    };
    client.on("botDisconnected", handleBotDisconnected);
    return () => { client.off("botDisconnected", handleBotDisconnected); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, isConnected, transcript, isEvaluating]);

  // Backup: transport state change
  const prevTransportStateRef = React.useRef(transportState);
  React.useEffect(() => {
    const prevState = prevTransportStateRef.current;
    prevTransportStateRef.current = transportState;
    if (
      (prevState === "connected" || prevState === "ready") &&
      transportState === "disconnected"
    ) {
      if (transcript.trim() && !isEvaluating && !evaluationTriggeredRef.current) {
        evaluationTriggeredRef.current = true;
        handleEvaluate();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transportState, transcript, isEvaluating]);

  const interpolatedPrompts = useMemo(() => {
    if (!botPromptConfig) return null;
    const assignmentForInterpolation = {
      questions: [question],
      max_attempts: maxAttempts || 1,
      bot_prompt_config: botPromptConfig,
      shared_context: sharedContext,
    };
    return interpolatePromptsForRuntime(
      assignmentForInterpolation as Parameters<typeof interpolatePromptsForRuntime>[0],
      question,
      language,
      attempts.length + 1,
    );
  }, [botPromptConfig, question, language, maxAttempts, attempts.length, sharedContext]);

  const connectionData = {
    language,
    question_prompt: question.prompt,
    rubric: question.rubric,
    assignment_id: assignmentId,
    question_order: question.order,
    submission_id: submissionId,
    attempt_number: attempts.length + 1,
    ...(process.env.NEXT_PUBLIC_SUPABASE_ENV && {
      supabase_env: process.env.NEXT_PUBLIC_SUPABASE_ENV,
    }),
    ...(interpolatedPrompts && {
      system_prompt: interpolatedPrompts.system_prompt,
      greeting: interpolatedPrompts.greeting,
    }),
    ...(sharedContext && { shared_context: sharedContext }),
  };

  const handleBotReady = () => {
    clearTranscript();
    evaluationTriggeredRef.current = false;
    logEvent("attempt_started");
  };

  return (
    <div className="relative">
      <AgentStatus className="py-2" />
      <div className="flex flex-col items-center gap-2">
        <VoiceConnectButton
          connectionData={connectionData}
          connectLabel="Start Answering"
          disconnectLabel="Stop Answering"
          onConnectStart={() => logEvent("bot_connect_initiated")}
          onBotReady={handleBotReady}
          onDisconnect={handleEvaluate}
          disabled={maxAttemptsReached}
        />
        {maxAttemptsReached && (
          <p className="text-xs text-muted-foreground text-center">
            Maximum attempts reached.
          </p>
        )}
      </div>

      {showGame && (
        <>
          <hr className="border-muted-foreground/20" />
          <EmojiMatchGame isActive={showGame} />
        </>
      )}

      <div className="flex justify-center py-4">
        <VoiceVisualizer participantType="bot" barColor="currentColor" />
      </div>

      {transcript && (
        <div className="mt-4 p-4 bg-muted/50 rounded-md max-h-76 overflow-y-auto">
          <div className="text-sm whitespace-pre-wrap">{transcript}</div>
        </div>
      )}

      {isEvaluating && <EvaluatingIndicator />}
    </div>
  );
}

export function VoiceInputArea(props: AssessmentInputProps) {
  return (
    <VoiceClient showVisualizer={false} showTranscript={false}>
      <VoiceAssessmentProvider>
        <VoiceInputContent {...props} />
      </VoiceAssessmentProvider>
    </VoiceClient>
  );
}
