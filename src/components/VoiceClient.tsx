"use client";
import { type PropsWithChildren } from "react";
import { PipecatClientAudio } from "@pipecat-ai/client-react";
import { PipecatProvider } from "@/providers/PipecatProvider";
import {
  VoiceVisualizer,
  TranscriptOverlay,
  ConversationProvider as PipecatConversationProvider,
} from "@pipecat-ai/voice-ui-kit";

interface VoiceClientProps extends PropsWithChildren {
  showVisualizer?: boolean;
  showTranscript?: boolean;
  visualizerBarColor?: string;
}

/**
 * Reusable voice client wrapper that provides all necessary voice infrastructure
 * Wraps children with PipecatProvider and PipecatConversationProvider
 * Includes audio, visualizer, and transcript components
 */
export function VoiceClient({
  children,
  showVisualizer = true,
  showTranscript = true,
  visualizerBarColor = "white",
}: VoiceClientProps) {
  return (
    <PipecatProvider>
      <PipecatConversationProvider>
        <div className="w-full flex flex-col items-center gap-4">
          <PipecatClientAudio />
          {showVisualizer && (
            <VoiceVisualizer
              participantType="bot"
              barColor={visualizerBarColor}
            />
          )}
          {showTranscript && <TranscriptOverlay participant="remote" />}
          {children}
        </div>
      </PipecatConversationProvider>
    </PipecatProvider>
  );
}

