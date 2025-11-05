"use client";
import { type PropsWithChildren, useState, useEffect } from "react";
import { PipecatClient } from "@pipecat-ai/client-js";
import { DailyTransport } from "@pipecat-ai/daily-transport";
import { PipecatClientProvider } from "@pipecat-ai/client-react";

export function PipecatProvider({ children }: PropsWithChildren) {
  const [client, setClient] = useState<PipecatClient | null>(null);

  useEffect(() => {
    // Only create the client in the browser environment
    if (typeof window !== "undefined") {
      const pipecatClient = new PipecatClient({
        transport: new DailyTransport(),
        enableMic: true,
        enableCam: false,
      });
      
      // Defer setState to avoid synchronous state update in effect
      queueMicrotask(() => {
        setClient(pipecatClient);
      });

      // Cleanup on unmount
      return () => {
        pipecatClient.disconnect().catch(console.error);
      };
    }
  }, []);

  // Don't render children until client is ready
  if (!client) {
    return null; // or a loading state
  }

  return (
    <PipecatClientProvider client={client}>{children}</PipecatClientProvider>
  );
}