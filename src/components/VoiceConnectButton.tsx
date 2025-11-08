"use client";
import {
  usePipecatClient,
  usePipecatClientTransportState,
} from "@pipecat-ai/client-react";
import { Button } from "@/components/ui/button";

interface VoiceConnectButtonProps {
  endpoint?: string;
  connectionData: {
    language: string;
    [key: string]: any;
  };
  onConnected?: () => void;
  onDisconnected?: () => void;
  disabled?: boolean;
  connectLabel?: string;
  disconnectLabel?: string;
}

/**
 * Specialized connect button for voice assessments
 * Accepts custom connection data to pass context to the server
 */
export function VoiceConnectButton({
  endpoint = "http://localhost:7860/start",
  connectionData,
  onConnected,
  onDisconnected,
  disabled = false,
  connectLabel = "Start Recording",
  disconnectLabel = "Stop Recording",
}: VoiceConnectButtonProps) {
  const client = usePipecatClient();
  const transportState = usePipecatClientTransportState();
  const isConnected = ["connected", "ready"].includes(transportState);

  const handleClick = async () => {
    if (!client) {
      console.error("Pipecat client is not initialized");
      return;
    }

    try {
      if (isConnected) {
        await client.disconnect();
        onDisconnected?.();
      } else {
        console.log("Connecting to bot with data:", connectionData);
        await client.startBotAndConnect({
          endpoint,
          requestData: {
            body: connectionData,
          },
        });
        onConnected?.();
      }
    } catch (error) {
      console.error("Connection error:", error);
    }
  };

  return (
    <Button
      onClick={handleClick}
      disabled={disabled || !client || transportState === "disconnecting"}
      variant={isConnected ? "destructive" : "default"}
      size="lg"
    >
      {isConnected ? disconnectLabel : connectLabel}
    </Button>
  );
}

