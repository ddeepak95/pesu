"use client";
import React, { createContext, useContext, useState, ReactNode } from "react";

export interface ConversationContextType {
  topic: string;
  language: string;
  setTopic: (topic: string) => void;
  setLanguage: (language: string) => void;
}

const ConversationContext = createContext<ConversationContextType | undefined>(
  undefined
);

export interface ConversationProviderProps {
  children: ReactNode;
  defaultTopic?: string;
  defaultLanguage?: string;
}

export function ConversationProvider({
  children,
  defaultTopic = "",
  defaultLanguage = "en",
}: ConversationProviderProps) {
  const [topic, setTopic] = useState<string>(defaultTopic);
  const [language, setLanguage] = useState<string>(defaultLanguage);

  const value: ConversationContextType = {
    topic,
    language,
    setTopic,
    setLanguage,
  };

  return (
    <ConversationContext.Provider value={value}>
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversation(): ConversationContextType {
  const context = useContext(ConversationContext);
  if (context === undefined) {
    throw new Error(
      "useConversation must be used within a ConversationProvider"
    );
  }
  return context;
}
