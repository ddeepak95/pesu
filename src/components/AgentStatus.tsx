"use client";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { RTVIEvent } from "@pipecat-ai/client-js";
import { usePipecatEventStream } from "@pipecat-ai/voice-ui-kit";
import {
  usePipecatClient,
  usePipecatClientTransportState,
} from "@pipecat-ai/client-react";

type AgentState =
  | "starting"
  | "listening"
  | "thinking"
  | "speaking"
  | "ready"
  | "disconnected";

interface AgentStatusProps {
  className?: string;
  /** When false and the agent is disconnected, status copy under the avatar is omitted. */
  showDisconnectedGuidance?: boolean;
}

/**
 * Component that displays the current state of the voice agent
 * States: Starting Up, Listening, Speaking, Thinking, Ready, Disconnected
 */
export function AgentStatus({
  className = "",
  showDisconnectedGuidance = true,
}: AgentStatusProps) {
  const [isLLMProcessing, setIsLLMProcessing] = useState(false);
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isBotReady, setIsBotReady] = useState(false);
  const speakingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const processedEventCountRef = useRef(0);

  const client = usePipecatClient();
  const transportState = usePipecatClientTransportState();
  const { events } = usePipecatEventStream({
    maxEvents: 100,
    groupConsecutive: false,
  });

  const clearSpeakingTimeout = useCallback(() => {
    if (speakingTimeoutRef.current) {
      clearTimeout(speakingTimeoutRef.current);
      speakingTimeoutRef.current = null;
    }
  }, []);

  const startBotSpeaking = useCallback(() => {
    clearSpeakingTimeout();
    setIsUserSpeaking(false);
    setIsLLMProcessing(false);
    setIsBotSpeaking(true);
  }, [clearSpeakingTimeout]);

  const stopBotSpeaking = useCallback(() => {
    clearSpeakingTimeout();
    setIsBotSpeaking(false);
  }, [clearSpeakingTimeout]);

  const scheduleSpeakingFallbackStop = useCallback(() => {
    clearSpeakingTimeout();
    speakingTimeoutRef.current = setTimeout(() => {
      setIsBotSpeaking(false);
      speakingTimeoutRef.current = null;
    }, 1000);
  }, [clearSpeakingTimeout]);

  const startBotThinking = useCallback(() => {
    clearSpeakingTimeout();
    setIsUserSpeaking(false);
    setIsBotSpeaking(false);
    setIsLLMProcessing(true);
  }, [clearSpeakingTimeout]);

  const stopBotThinking = useCallback(() => {
    setIsLLMProcessing(false);
  }, []);

  const startUserSpeaking = useCallback(() => {
    setIsUserSpeaking(true);
  }, []);

  const stopUserSpeaking = useCallback(() => {
    setIsUserSpeaking(false);
  }, []);

  const markBotReady = useCallback(() => {
    setIsBotReady(true);
  }, []);

  useEffect(() => {
    if (!client) return;

    const handleBotTtsText = () => {
      setIsUserSpeaking(false);
      setIsLLMProcessing(false);
      setIsBotSpeaking(true);
      scheduleSpeakingFallbackStop();
    };

    client.on(RTVIEvent.BotReady, markBotReady);
    client.on("botConnected", markBotReady);
    client.on(RTVIEvent.BotLlmStarted, startBotThinking);
    client.on(RTVIEvent.BotLlmStopped, stopBotThinking);
    client.on(RTVIEvent.BotStartedSpeaking, startBotSpeaking);
    client.on(RTVIEvent.BotStoppedSpeaking, stopBotSpeaking);
    client.on(RTVIEvent.BotTtsStarted, startBotSpeaking);
    client.on(RTVIEvent.BotTtsStopped, stopBotSpeaking);
    client.on(RTVIEvent.BotTtsText, handleBotTtsText);
    client.on(RTVIEvent.UserStartedSpeaking, startUserSpeaking);
    client.on(RTVIEvent.UserStoppedSpeaking, stopUserSpeaking);

    return () => {
      client.off(RTVIEvent.BotReady, markBotReady);
      client.off("botConnected", markBotReady);
      client.off(RTVIEvent.BotLlmStarted, startBotThinking);
      client.off(RTVIEvent.BotLlmStopped, stopBotThinking);
      client.off(RTVIEvent.BotStartedSpeaking, startBotSpeaking);
      client.off(RTVIEvent.BotStoppedSpeaking, stopBotSpeaking);
      client.off(RTVIEvent.BotTtsStarted, startBotSpeaking);
      client.off(RTVIEvent.BotTtsStopped, stopBotSpeaking);
      client.off(RTVIEvent.BotTtsText, handleBotTtsText);
      client.off(RTVIEvent.UserStartedSpeaking, startUserSpeaking);
      client.off(RTVIEvent.UserStoppedSpeaking, stopUserSpeaking);
    };
  }, [
    client,
    markBotReady,
    scheduleSpeakingFallbackStop,
    startBotSpeaking,
    startBotThinking,
    startUserSpeaking,
    stopBotSpeaking,
    stopBotThinking,
    stopUserSpeaking,
  ]);

  // Process RTVI events to track agent state
  // Note: setState calls here are in response to external event stream, not derived from React state
  useEffect(() => {
    if (events.length === 0) {
      processedEventCountRef.current = 0;
      return;
    }

    if (processedEventCountRef.current > events.length) {
      processedEventCountRef.current = 0;
    }

    const newEvents = events.slice(processedEventCountRef.current);
    processedEventCountRef.current = events.length;
    if (newEvents.length === 0) return;

    // Using queueMicrotask to defer state updates and avoid cascading render warnings
    const handleEvent = () => {
      for (const event of newEvents) {
        switch (event.type) {
          // Bot ready events (camelCase format)
          case "botReady":
          case "bot-ready":
          case "botConnected":
            markBotReady();
            break;

          // LLM processing events
          case "botLlmStarted":
          case "bot-llm-started":
            startBotThinking();
            break;

          case "botLlmStopped":
          case "bot-llm-stopped":
            stopBotThinking();
            break;

          // Bot speaking lifecycle
          case "botStartedSpeaking":
          case "bot-started-speaking":
          case "botTtsStarted":
          case "bot-tts-started":
            startBotSpeaking();
            break;

          case "botStoppedSpeaking":
          case "bot-stopped-speaking":
          case "botTtsStopped":
          case "bot-tts-stopped":
            stopBotSpeaking();
            break;

          // Bot speaking fallback for clients that only emit TTS text chunks.
          case "botTtsText":
          case "bot-tts-text":
            setIsUserSpeaking(false);
            setIsLLMProcessing(false);
            setIsBotSpeaking(true);
            scheduleSpeakingFallbackStop();
            break;

          // User speaking events
          case "userStartedSpeaking":
          case "user-started-speaking":
            startUserSpeaking();
            break;

          case "userStoppedSpeaking":
          case "user-stopped-speaking":
            stopUserSpeaking();
            break;
        }
      }
    };

    queueMicrotask(handleEvent);
  }, [
    clearSpeakingTimeout,
    events,
    markBotReady,
    scheduleSpeakingFallbackStop,
    startBotSpeaking,
    startBotThinking,
    startUserSpeaking,
    stopBotSpeaking,
    stopBotThinking,
    stopUserSpeaking,
  ]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      clearSpeakingTimeout();
    };
  }, [clearSpeakingTimeout]);

  // Reset states when disconnected
  // Note: setState calls here are in response to transport state changes (external system)
  useEffect(() => {
    if (!["connected", "ready"].includes(transportState)) {
      queueMicrotask(() => {
        clearSpeakingTimeout();
        setIsBotReady(false);
        setIsLLMProcessing(false);
        setIsBotSpeaking(false);
        setIsUserSpeaking(false);
      });
    }
  }, [clearSpeakingTimeout, transportState]);

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

    // Priority 2: Bot is speaking. Prefer real bot output over stale user VAD.
    if (isBotSpeaking) {
      return "speaking";
    }

    // Priority 3: Bot is processing LLM (thinking)
    if (isLLMProcessing) {
      return "thinking";
    }

    // Priority 4: User is speaking (listening)
    if (isUserSpeaking) {
      return "listening";
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

  // Timer for phased starting messages + game
  const [startingTimerElapsed, setStartingTimerElapsed] = useState(false);

  useEffect(() => {
    if (agentState === "starting") {
      queueMicrotask(() => setStartingTimerElapsed(false));
      const timer = setTimeout(() => setStartingTimerElapsed(true), 7000);
      return () => clearTimeout(timer);
    } else {
      queueMicrotask(() => setStartingTimerElapsed(false));
    }
  }, [agentState]);

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
          text: startingTimerElapsed
            ? "Konvo is preparing for the activity. This might take up to 3 minutes. You can think of the answer in the meanwhile."
            : "Please wait while Konvo is starting up. Respond only after Konvo is ready and talking.",
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
          text: "Click the below button to start the conversation. Wait for the bot to talk before you speak.",
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
      {!(agentState === "disconnected" && !showDisconnectedGuidance) && (
        <p className={`text-sm text-center font-medium ${display.color}`}>
          {display.text}
        </p>
      )}
    </div>
  );
}
