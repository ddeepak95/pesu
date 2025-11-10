"use client";
import React, { useEffect, useState, useRef, useMemo } from "react";
import { usePipecatEventStream } from "@pipecat-ai/voice-ui-kit";
import { usePipecatClientTransportState } from "@pipecat-ai/client-react";

type AgentState =
  | "starting"
  | "listening"
  | "thinking"
  | "speaking"
  | "ready"
  | "disconnected";

interface AgentStatusProps {
  className?: string;
}

/**
 * Component that displays the current state of the voice agent
 * States: Starting Up, Listening, Speaking, Thinking, Ready, Disconnected
 */
export function AgentStatus({ className = "" }: AgentStatusProps) {
  const [isLLMProcessing, setIsLLMProcessing] = useState(false);
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isBotReady, setIsBotReady] = useState(false);
  const speakingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const transportState = usePipecatClientTransportState();
  const { events } = usePipecatEventStream({
    maxEvents: 100,
    groupConsecutive: false,
  });

  // Process RTVI events to track agent state
  // Note: setState calls here are in response to external event stream, not derived from React state
  useEffect(() => {
    if (events.length === 0) return;

    // Get the most recent event
    const latestEvent = events[events.length - 1];

    // Using queueMicrotask to defer state updates and avoid cascading render warnings
    const handleEvent = () => {
      switch (latestEvent.type) {
        // Bot ready events (camelCase format)
        case "botReady":
        case "bot-ready":
        case "botConnected":
          setIsBotReady(true);
          break;

        // LLM processing events
        case "botLlmStarted":
        case "bot-llm-started":
          setIsLLMProcessing(true);
          break;

        case "botLlmStopped":
        case "bot-llm-stopped":
          setIsLLMProcessing(false);
          break;

        // TTS processing events (not currently used, but kept for compatibility)
        case "botTtsStarted":
        case "bot-tts-started":
          // TTS started - no action needed as we track botTtsText for speaking state
          break;

        case "botTtsStopped":
        case "bot-tts-stopped":
          // TTS stopped - no action needed
          break;

        // Bot speaking (TTS output)
        case "botTtsText":
        case "bot-tts-text":
          // Bot is actively speaking
          setIsBotSpeaking(true);

          // Clear any existing timeout
          if (speakingTimeoutRef.current) {
            clearTimeout(speakingTimeoutRef.current);
          }

          // Set a timeout to mark speaking as done if no more text comes
          speakingTimeoutRef.current = setTimeout(() => {
            setIsBotSpeaking(false);
          }, 1000); // 1 second after last text chunk

          break;

        // User speaking events
        case "userStartedSpeaking":
        case "user-started-speaking":
          setIsUserSpeaking(true);
          break;

        case "userStoppedSpeaking":
        case "user-stopped-speaking":
          setIsUserSpeaking(false);
          break;
      }
    };

    queueMicrotask(handleEvent);
  }, [events]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (speakingTimeoutRef.current) {
        clearTimeout(speakingTimeoutRef.current);
      }
    };
  }, []);

  // Reset states when disconnected
  // Note: setState calls here are in response to transport state changes (external system)
  useEffect(() => {
    if (!["connected", "ready"].includes(transportState)) {
      queueMicrotask(() => {
        setIsBotReady(false);
        setIsLLMProcessing(false);
        setIsBotSpeaking(false);
        setIsUserSpeaking(false);
      });
    }
  }, [transportState]);

  // Determine agent state based on priority hierarchy using useMemo
  const agentState: AgentState = useMemo(() => {
    // Priority 1: Starting up (connecting or connected but bot not ready)
    if (
      transportState === "connecting" ||
      (["connected", "ready"].includes(transportState) && !isBotReady)
    ) {
      return "starting";
    }

    // If not connected, show disconnected
    if (!["connected", "ready"].includes(transportState)) {
      return "disconnected";
    }

    // Priority 2: User is speaking (listening)
    if (isUserSpeaking) {
      return "listening";
    }

    // Priority 3: Bot is speaking
    if (isBotSpeaking) {
      return "speaking";
    }

    // Priority 4: Bot is processing LLM (thinking)
    if (isLLMProcessing) {
      return "thinking";
    }

    // Priority 5: Connected and ready (idle)
    if (isBotReady) {
      return "ready";
    }

    // Default
    return "disconnected";
  }, [
    transportState,
    isBotReady,
    isLLMProcessing,
    isBotSpeaking,
    isUserSpeaking,
  ]);

  // Get display text and styling based on state
  const getStateDisplay = () => {
    switch (agentState) {
      case "starting":
        return {
          text: "Agent is starting up. This takes upto 30 seconds. Please wait...",
          color: "text-yellow-600",
        };
      case "listening":
        return {
          text: "Agent is listening",
          color: "text-blue-600",
        };
      case "speaking":
        return {
          text: "Agent is speaking",
          color: "text-indigo-600",
        };
      case "thinking":
        return {
          text: "Agent is thinking...",
          color: "text-purple-600",
        };
      case "ready":
        return {
          text: "Agent is ready",
          color: "text-green-600",
        };
      case "disconnected":
      default:
        return {
          text: "Agent is disconnected",
          color: "text-gray-400",
        };
    }
  };

  const display = getStateDisplay();

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <p className={`text-sm font-medium ${display.color}`}>{display.text}</p>
    </div>
  );
}
