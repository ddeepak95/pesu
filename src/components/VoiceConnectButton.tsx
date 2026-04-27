"use client";
import React from "react";
import { createPortal } from "react-dom";
import {
  usePipecatClient,
  usePipecatClientTransportState,
} from "@pipecat-ai/client-react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showErrorToast } from "@/lib/toast";
import type { MicPermissionState } from "@/hooks/useMicrophonePermission";

interface VoiceConnectButtonProps {
  endpoint?: string;
  connectionData: Record<string, unknown> & {
    language: string;
  };
  onConnectStart?: () => void;
  onConnected?: () => void;
  onBotReady?: () => void;
  onDisconnect?: () => void;
  disabled?: boolean;
  connectLabel?: string;
  disconnectLabel?: string;
  /** When set with onRequestMicrophone, connect is gated until state is granted. */
  micPermission?: MicPermissionState;
  onRequestMicrophone?: () => Promise<void>;
  requestMicLabel?: string;
  micDeniedHint?: string;
  /** Notifies parent while getUserMedia is awaiting (browser mic prompt). */
  onVoiceMicPermissionRequestPendingChange?: (pending: boolean) => void;
}

/**
 * Specialized connect button for voice assessments
 * Manual connect/disconnect with RTVI message support for context updates
 */
export function VoiceConnectButton({
  endpoint,
  connectionData,
  onConnectStart,
  onConnected,
  onBotReady,
  onDisconnect,
  disabled = false,
  connectLabel = "Start Recording",
  disconnectLabel = "Stop Answering",
  micPermission,
  onRequestMicrophone,
  requestMicLabel = "Allow microphone access",
  micDeniedHint = "Microphone access is blocked. Update site permissions in your browser settings, then reload the page.",
  onVoiceMicPermissionRequestPendingChange,
}: VoiceConnectButtonProps) {
  const client = usePipecatClient();
  const transportState = usePipecatClientTransportState();
  const isConnected = ["connected", "ready"].includes(transportState);
  const [micRequestPending, setMicRequestPending] = React.useState(false);
  const onMicPendingChangeRef = React.useRef(
    onVoiceMicPermissionRequestPendingChange,
  );
  React.useEffect(() => {
    onMicPendingChangeRef.current = onVoiceMicPermissionRequestPendingChange;
  }, [onVoiceMicPermissionRequestPendingChange]);

  React.useEffect(() => {
    onMicPendingChangeRef.current?.(micRequestPending);
  }, [micRequestPending]);

  React.useEffect(() => {
    return () => {
      onMicPendingChangeRef.current?.(false);
    };
  }, []);

  const micGateActive =
    micPermission !== undefined &&
    onRequestMicrophone !== undefined &&
    !disabled;
  const micGranted = !micGateActive || micPermission === "granted";

  const handleConnect = async () => {
    if (!client || isConnected) {
      return;
    }

    onConnectStart?.();

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
      onConnected?.();
    } catch (error) {
      console.error("Connection error:", error);
      showErrorToast(
        `Connection failed: ${error instanceof Error ? error.message : "Check the console for details."}`,
      );
    }
  };

  const handleDisconnect = async () => {
    if (!client) return;

    try {
      console.log("Disconnecting...");
      await client.disconnect();
      console.log("Disconnect completed");

      if (onDisconnect) {
        console.log("Calling onDisconnect callback...");
        await onDisconnect();
        console.log("onDisconnect callback completed");
      } else {
        console.warn("No onDisconnect callback provided");
      }
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
    if (isConnected) {
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
    if (isConnected) {
      return disconnectLabel;
    }
    return connectLabel;
  };

  const isButtonDisabled =
    disabled || !client || transportState === "disconnecting";

  const handleRequestMic = async () => {
    if (!onRequestMicrophone || micRequestPending) return;
    setMicRequestPending(true);
    try {
      await onRequestMicrophone();
    } finally {
      setMicRequestPending(false);
    }
  };

  if (micGateActive && !isConnected && !micGranted) {
    if (micPermission === "denied") {
      return (
        <div className="flex flex-col items-center gap-2 max-w-sm">
          <Button type="button" disabled variant="secondary" size="lg">
            Microphone blocked
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            {micDeniedHint}
          </p>
        </div>
      );
    }
    return (
      <div className="inline-flex min-h-10 items-center justify-center">
        {typeof document !== "undefined" &&
          micRequestPending &&
          createPortal(
            <div
              className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-[1px]"
              role="status"
              aria-live="polite"
              aria-label="Waiting for microphone permission"
            >
              <Loader2
                className="h-10 w-10 animate-spin text-primary"
                aria-hidden
              />
              <p className="max-w-sm px-4 text-center text-sm font-medium text-foreground">
                {
                  "Use your browser's microphone prompt to allow or block access."
                }
              </p>
            </div>,
            document.body,
          )}
        {micRequestPending ? (
          <span className="sr-only">Waiting for microphone permission</span>
        ) : (
          <Button
            type="button"
            onClick={handleRequestMic}
            disabled={disabled}
            variant="default"
            size="lg"
          >
            {requestMicLabel}
          </Button>
        )}
      </div>
    );
  }

  return (
    <Button
      onClick={handleClick}
      disabled={isButtonDisabled}
      variant={isConnected ? "destructive" : "default"}
      size="lg"
    >
      {getButtonLabel()}
    </Button>
  );
}
