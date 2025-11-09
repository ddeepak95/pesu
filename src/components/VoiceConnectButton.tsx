"use client";
import React from "react";
import {
  usePipecatClient,
  usePipecatClientTransportState,
} from "@pipecat-ai/client-react";
import { Button } from "@/components/ui/button";

interface VoiceConnectButtonProps {
  endpoint?: string;
  connectionData: Record<string, unknown> & {
    language: string;
  };
  onConnected?: () => void;
  onBotReady?: () => void;
  onDisconnect?: () => void;
  disabled?: boolean;
  connectLabel?: string;
  disconnectLabel?: string;
}

/**
 * Specialized connect button for voice assessments
 * Manual connect/disconnect with RTVI message support for context updates
 */
export function VoiceConnectButton({
  endpoint,
  connectionData,
  onConnected,
  onBotReady,
  onDisconnect,
  disabled = false,
  connectLabel = "Start Recording",
  disconnectLabel = "Stop Answering",
}: VoiceConnectButtonProps) {
  const client = usePipecatClient();
  const transportState = usePipecatClientTransportState();
  const isConnected = ["connected", "ready"].includes(transportState);
  const [conversationStarted, setConversationStarted] = React.useState(false);

  const handleConnect = async () => {
    if (!client || isConnected) {
      return;
    }

    try {
      console.log("Starting bot and connecting with data:", connectionData);

      const apiEndpoint = endpoint || "/api/pipecat/start";

      await client.startBotAndConnect({
        endpoint: apiEndpoint,
        requestData: connectionData as Record<
          string,
          string | number | boolean | null
        >,
      });

      console.log("Connection successful!");
      setConversationStarted(true);
      onConnected?.();
    } catch (error) {
      console.error("Connection error:", error);
      alert(`Connection failed. Check console for details.`);
    }
  };

  const handleDisconnect = async () => {
    if (!client) return;

    try {
      console.log("Disconnecting...");

      // Call onDisconnect BEFORE disconnect to ensure evaluation happens
      console.log("Calling onDisconnect callback...");
      if (onDisconnect) {
        onDisconnect();
        console.log("onDisconnect callback completed");
      } else {
        console.warn("No onDisconnect callback provided");
      }

      // Now disconnect
      await client.disconnect();
      setConversationStarted(false);
      console.log("Disconnect completed");
    } catch (error) {
      console.error("Error disconnecting:", error);
    }
  };

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

  const handleClick = async () => {
    if (isConnected && conversationStarted) {
      // Disconnect completely
      await handleDisconnect();
    } else {
      // Not connected, connect
      await handleConnect();
    }
  };

  // Determine button label
  const getButtonLabel = () => {
    if (
      transportState === "connecting" ||
      transportState === "authenticating"
    ) {
      return "Connecting...";
    }
    if (isConnected && conversationStarted) {
      return disconnectLabel;
    }
    return connectLabel;
  };

  const isButtonDisabled =
    disabled || !client || transportState === "disconnecting";

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
