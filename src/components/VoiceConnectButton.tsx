"use client";
import React from "react";
import {
  usePipecatClient,
  usePipecatClientTransportState,
} from "@pipecat-ai/client-react";
import { RTVIMessage } from "@pipecat-ai/client-js";
import { Button } from "@/components/ui/button";

interface VoiceConnectButtonProps {
  endpoint?: string;
  connectionData: Record<string, unknown> & {
    language: string;
  };
  onConnected?: () => void;
  onDisconnected?: () => void;
  onBotReady?: () => void;
  disabled?: boolean;
  connectLabel?: string;
  disconnectLabel?: string;
  autoConnect?: boolean;
  mode?: "connect" | "start" | "stop";
  onModeReady?: (mode: "ready" | "connecting" | "disconnected") => void;
}

/**
 * Specialized connect button for voice assessments
 * Supports auto-connect mode and RTVI message sending
 */
export function VoiceConnectButton({
  endpoint,
  connectionData,
  onConnected,
  onDisconnected,
  onBotReady,
  disabled = false,
  connectLabel = "Start Recording",
  disconnectLabel = "Stop Recording",
  autoConnect = false,
  mode = "connect",
  onModeReady,
}: VoiceConnectButtonProps) {
  const client = usePipecatClient();
  const transportState = usePipecatClientTransportState();
  const isConnected = ["connected", "ready"].includes(transportState);
  const [hasAutoConnected, setHasAutoConnected] = React.useState(false);
  const [conversationStarted, setConversationStarted] = React.useState(false);

  // Auto-connect on mount if enabled
  React.useEffect(() => {
    if (autoConnect && !hasAutoConnected && client && !isConnected) {
      setHasAutoConnected(true);
      handleConnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, hasAutoConnected, client, isConnected]);

  // Notify parent of connection state changes
  React.useEffect(() => {
    if (onModeReady) {
      if (isConnected) {
        onModeReady("ready");
      } else if (
        transportState === "connecting" ||
        transportState === "authenticating"
      ) {
        onModeReady("connecting");
      } else {
        onModeReady("disconnected");
      }
    }
  }, [isConnected, transportState, onModeReady]);

  // Listen for bot_ready event
  React.useEffect(() => {
    if (!client) return;

    const handleBotReady = () => {
      console.log("Bot is ready");
      onBotReady?.();
    };

    client.on("botReady", handleBotReady);

    return () => {
      client.off("botReady", handleBotReady);
    };
  }, [client, onBotReady]);

  const handleConnect = async () => {
    if (!client) {
      console.error("Pipecat client is not initialized");
      return;
    }

    try {
      console.log("Connecting to bot with data:", connectionData);

      // Always use the API route - backend decides local vs cloud
      const apiEndpoint = endpoint || "/api/pipecat/start";

      console.log("Connecting via API route:", apiEndpoint);

      await client.startBotAndConnect({
        endpoint: apiEndpoint,
        requestData: connectionData as Record<
          string,
          string | number | boolean | null
        >,
      });

      onConnected?.();
    } catch (error) {
      console.error("Connection error:", error);

      // Extract more details from the error
      if (error && typeof error === "object") {
        if ("message" in error) {
          console.error("Error message:", error.message);
        }
        if ("response" in error) {
          console.error("Error response:", error.response);
        }
        if ("status" in error) {
          console.error("Error status:", error.status);
        }
      }

      // Show user-friendly error message
      const errorMsg =
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string"
          ? error.message
          : "Failed to connect to voice service";
      alert(`Connection failed: ${errorMsg}\n\nCheck console for details.`);
    }
  };

  const handleStartConversation = async () => {
    if (!client || !isConnected) {
      console.error("Cannot start conversation: not connected");
      return;
    }

    try {
      console.log("Sending client_ready signal to bot");
      // Send client_ready signal to trigger bot greeting
      client.transport.sendReadyMessage();
      setConversationStarted(true);
    } catch (error) {
      console.error("Error starting conversation:", error);
    }
  };

  const handleDisconnect = async () => {
    if (!client) return;

    try {
      await client.disconnect();
      setConversationStarted(false);
      setHasAutoConnected(false);
      onDisconnected?.();
    } catch (error) {
      console.error("Error disconnecting:", error);
    }
  };

  const handleClick = async () => {
    if (mode === "stop" || (isConnected && conversationStarted)) {
      await handleDisconnect();
    } else if (mode === "start" && isConnected && !conversationStarted) {
      await handleStartConversation();
    } else if (mode === "connect" && !isConnected) {
      await handleConnect();
    }
  };

  // Determine button state and label
  const getButtonLabel = () => {
    if (!isConnected && transportState === "connecting") {
      return "Connecting...";
    }
    if (isConnected && !conversationStarted && mode === "start") {
      return connectLabel;
    }
    if (isConnected && conversationStarted) {
      return disconnectLabel;
    }
    if (!isConnected) {
      return connectLabel;
    }
    return connectLabel;
  };

  const isButtonDisabled =
    disabled ||
    !client ||
    transportState === "disconnecting" ||
    (mode === "start" && !isConnected) ||
    (mode === "stop" && !isConnected);

  return (
    <Button
      onClick={handleClick}
      disabled={isButtonDisabled}
      variant={isConnected && conversationStarted ? "destructive" : "default"}
      size="lg"
    >
      {getButtonLabel()}
    </Button>
  );
}

/**
 * Helper function to send context update message to the bot
 * Call this when navigating between questions
 */
export function sendContextUpdate(
  client: ReturnType<typeof usePipecatClient>,
  questionData: {
    question_prompt: string;
    rubric: Array<{ item: string; points: number }>;
    question_order: number;
  }
) {
  if (!client) {
    console.error("Cannot send context update: client not initialized");
    return;
  }

  try {
    console.log("Sending context update:", questionData);

    // Send custom message to bot via RTVI
    const message = new RTVIMessage("update_question_context", questionData);
    client.transport.sendMessage(message);

    console.log("Context update sent successfully");
  } catch (error) {
    console.error("Error sending context update:", error);
  }
}
