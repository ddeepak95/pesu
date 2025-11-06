"use client";
import { PipecatClientAudio } from "@pipecat-ai/client-react";
import { PipecatProvider } from "@/providers/PipecatProvider";
import { ConnectButton } from "@/components/ConnectButton";
import {
  VoiceVisualizer,
  TranscriptOverlay,
  ConversationProvider as PipecatConversationProvider,
} from "@pipecat-ai/voice-ui-kit";
import { ConversationProvider } from "@/contexts/ConversationContext";
import { ConversationSettings } from "@/components/ConversationSettings";
import { Conversation } from "@/components/Conversation";
import { EventStreamExample } from "@/components/Events";
function AppContent() {
  return (
    <div className="w-full">
      <div className="flex flex-col items-center justify-center gap-4 w-full">
        <ConversationSettings />
        <div className="w-full text-center">
          <ConnectButton />
        </div>

        <PipecatClientAudio />
        <VoiceVisualizer participantType="bot" barColor="white" />
        <TranscriptOverlay participant="remote" />
        <Conversation />
        <EventStreamExample />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div className="w-full">
      <ConversationProvider
        defaultTopic="General conversation"
        defaultLanguage="ta"
      >
        <PipecatProvider>
          <PipecatConversationProvider>
            <AppContent />
          </PipecatConversationProvider>
        </PipecatProvider>
      </ConversationProvider>
    </div>
  );
}
