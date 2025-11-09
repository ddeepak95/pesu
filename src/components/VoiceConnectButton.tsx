"use client";
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
  endpoint,
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

        // Determine endpoint based on USE_CLOUD flag or use provided endpoint
        const useCloud = process.env.NEXT_PUBLIC_PIPECAT_USE_CLOUD === "true";
        const resolvedEndpoint =
          endpoint ||
          (useCloud
            ? process.env.NEXT_PUBLIC_PIPECAT_CLOUD_ENDPOINT ||
              "https://api.pipecat.daily.co/v1/public/pesu-pipecat/start"
            : process.env.NEXT_PUBLIC_PIPECAT_LOCAL_ENDPOINT ||
              "http://localhost:7860/start");

        // Prepare configuration object with optional headers
        const config = {
          endpoint: resolvedEndpoint,
          requestData: {
            body: connectionData as Record<
              string,
              string | number | boolean | null
            >,
            ...(useCloud &&
              process.env.NEXT_PUBLIC_PIPECAT_API_KEY && {
                headers: {
                  Authorization: `Bearer ${process.env.NEXT_PUBLIC_PIPECAT_API_KEY}`,
                },
              }),
          },
        };

        await client.startBotAndConnect(config);
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
