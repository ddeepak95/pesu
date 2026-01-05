"use client";
import React, { useEffect, useState, useRef, useMemo } from "react";
import Image from "next/image";
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

  // Get avatar image path based on state
  const getAvatarImage = (state: AgentState): string => {
    switch (state) {
      case "starting":
        return "/speaking_avatars/getting_ready.png";
      case "listening":
        return "/speaking_avatars/listening.png";
      case "speaking":
        return "/speaking_avatars/speaking.png";
      case "thinking":
        return "/speaking_avatars/thinking.png";
      case "ready":
        return "/speaking_avatars/speaking.png";
      case "disconnected":
        return "/speaking_avatars/disconnected.png";
      default:
        return "/speaking_avatars/speaking.png";
    }
  };

  // Get ring animation and color based on state
  const getRingConfig = (state: AgentState) => {
    switch (state) {
      case "starting":
        return {
          animationClass: "animate-ring-pulse",
          color: "border-yellow-600",
          ringCount: 1,
        };
      case "listening":
        return {
          animationClass: "animate-ring-pulse",
          color: "border-blue-600",
          ringCount: 1,
        };
      case "speaking":
        return {
          animationClass: "animate-ring-ripple",
          color: "border-indigo-600",
          ringCount: 3,
        };
      case "thinking":
        return {
          animationClass: "animate-ring-spin",
          color: "border-purple-600",
          ringCount: 1,
        };
      case "ready":
        return {
          animationClass: "animate-ring-breathe",
          color: "border-green-600",
          ringCount: 1,
        };
      case "disconnected":
      default:
        return {
          animationClass: "",
          color: "border-gray-400",
          ringCount: 1,
        };
    }
  };

  // Get display text and styling based on state
  const getStateDisplay = () => {
    switch (agentState) {
      case "starting":
        return {
          text: "Konvo is preparing for the activity. This takes upto 30 seconds. Please wait...",
          color: "text-yellow-600",
        };
      case "listening":
        return {
          text: "Konvo is listening",
          color: "text-blue-600",
        };
      case "speaking":
        return {
          text: "Konvo is speaking",
          color: "text-indigo-600",
        };
      case "thinking":
        return {
          text: "Konvo is thinking...",
          color: "text-purple-600",
        };
      case "ready":
        return {
          text: "Konvo is ready",
          color: "text-green-600",
        };
      case "disconnected":
      default:
        return {
          text: "Konvo is disconnected",
          color: "text-gray-400",
        };
    }
  };

  const display = getStateDisplay();
  const avatarImage = getAvatarImage(agentState);
  const ringConfig = getRingConfig(agentState);
  const isDisconnected = agentState === "disconnected";

  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 ${className}`}
    >
      {/* Avatar with animated rings */}
      <div className="relative w-40 h-40 flex items-center justify-center">
        {/* Animated rings */}
        {ringConfig.ringCount === 1 ? (
          <div
            className={`absolute inset-0 m-auto rounded-full ${
              ringConfig.color
            } ${ringConfig.animationClass || ""} ${
              isDisconnected ? "opacity-50" : ""
            }`}
            style={{
              width: "160px",
              height: "160px",
              borderWidth: "2.5px",
            }}
          />
        ) : (
          // Multiple rings for ripple effect
          Array.from({ length: ringConfig.ringCount }).map((_, index) => (
            <div
              key={index}
              className={`absolute inset-0 m-auto rounded-full ${
                ringConfig.color
              } ${ringConfig.animationClass} ${
                isDisconnected ? "opacity-50" : ""
              }`}
              style={{
                width: "160px",
                height: "160px",
                borderWidth: "2.5px",
                animationDelay: `${index * 0.5}s`,
              }}
            />
          ))
        )}

        {/* Avatar circle container */}
        <div
          className={`relative w-32 h-32 rounded-full overflow-hidden border-4 ${
            ringConfig.color
          } ${isDisconnected ? "opacity-50 grayscale" : ""}`}
        >
          <Image
            src={avatarImage}
            alt={`Konvo ${agentState}`}
            fill
            className="object-cover"
            style={{
              transform: "scale(1.5) translateY(15px)",
            }}
            sizes="128px"
          />
        </div>
      </div>

      {/* Status text */}
      <p className={`text-sm font-medium ${display.color}`}>{display.text}</p>
    </div>
  );
}
