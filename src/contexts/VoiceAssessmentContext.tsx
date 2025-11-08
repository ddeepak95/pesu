"use client";
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { usePipecatConversation } from "@pipecat-ai/voice-ui-kit";

export interface VoiceAssessmentContextType {
  transcript: string;
  clearTranscript: () => void;
  getFullTranscript: () => string;
  setTranscript: (transcript: string) => void;
}

const VoiceAssessmentContext = createContext<VoiceAssessmentContextType | undefined>(
  undefined
);

export interface VoiceAssessmentProviderProps {
  children: ReactNode;
}

/**
 * Context provider for managing voice assessment transcripts
 * Integrates with pipecat conversation messages to accumulate transcripts
 */
export function VoiceAssessmentProvider({
  children,
}: VoiceAssessmentProviderProps) {
  const [transcript, setTranscript] = useState<string>("");
  const { messages } = usePipecatConversation();

  // Accumulate user messages into transcript
  useEffect(() => {
    const userMessages = messages
      .filter((m) => m.role === "user")
      .map((m) => 
        m.parts
          .map((part) => (typeof part.text === "string" ? part.text : ""))
          .join(" ")
      )
      .filter(Boolean)
      .join("\n");

    if (userMessages) {
      setTranscript(userMessages);
    }
  }, [messages]);

  const clearTranscript = () => {
    setTranscript("");
  };

  const getFullTranscript = () => {
    return transcript;
  };

  const value: VoiceAssessmentContextType = {
    transcript,
    clearTranscript,
    getFullTranscript,
    setTranscript,
  };

  return (
    <VoiceAssessmentContext.Provider value={value}>
      {children}
    </VoiceAssessmentContext.Provider>
  );
}

export function useVoiceTranscript(): VoiceAssessmentContextType {
  const context = useContext(VoiceAssessmentContext);
  if (context === undefined) {
    throw new Error(
      "useVoiceTranscript must be used within a VoiceAssessmentProvider"
    );
  }
  return context;
}

