"use client";
import {
    PipecatClientAudio,
  } from "@pipecat-ai/client-react";
import { PipecatProvider } from "@/providers/PipecatProvider";
import { ConnectButton } from "@/components/ConnectButton";
import {VoiceVisualizer} from "@pipecat-ai/voice-ui-kit";
import { DebugDisplay } from "@/components/DebugDisplay";


function AppContent() {
    return (
        <div>
             <ConnectButton />
            <PipecatClientAudio />
            <VoiceVisualizer participantType="bot" barColor="white" />
            <DebugDisplay />


        </div>
    );
}


export default function App() {
    return (
        <div>
            <PipecatProvider>
            <AppContent />
            </PipecatProvider>
        </div>
    );
}