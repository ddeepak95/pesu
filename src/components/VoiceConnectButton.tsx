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
      }
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
