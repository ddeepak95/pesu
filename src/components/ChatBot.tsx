"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  RTVIEvent,
  TranscriptData,
  BotLLMTextData,
} from "@pipecat-ai/client-js";
import { useRTVIClientEvent } from "@pipecat-ai/client-react";
import "./ChatBot.css";

export interface Message {
  id: string;
  text: string;
  sender: "user" | "bot";
  timestamp: Date;
  isFinal: boolean;
}

export function ChatBot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingMessageRef = useRef<{ user?: string; bot?: string }>({
    user: undefined,
    bot: undefined,
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const updateOrAddMessage = useCallback(
    (text: string, sender: "user" | "bot", isFinal: boolean = false) => {
      if (!text.trim()) return;

      setMessages((prev) => {
        const streamingId = streamingMessageRef.current[sender];
        const existingIndex = streamingId
          ? prev.findIndex((m) => m.id === streamingId)
          : -1;

        if (existingIndex >= 0) {
          // Update existing streaming message
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            text: text.trim(),
            isFinal,
          };
          if (isFinal) {
            streamingMessageRef.current[sender] = undefined;
          }
          return updated;
        } else {
          // Create new message
          const newId = `${Date.now()}-${Math.random()}`;
          if (!isFinal) {
            streamingMessageRef.current[sender] = newId;
          }
          return [
            ...prev,
            {
              id: newId,
              text: text.trim(),
              sender,
              timestamp: new Date(),
              isFinal,
            },
          ];
        }
      });
    },
    []
  );

  // Listen for user transcripts (includes interim and final)
  useRTVIClientEvent(
    RTVIEvent.UserTranscript,
    useCallback(
      (data: TranscriptData) => {
        if (data.text.trim()) {
          updateOrAddMessage(data.text.trim(), "user", data.final || false);
        }
      },
      [updateOrAddMessage]
    )
  );

  // Listen for bot LLM text (streaming as it's generated)
  useRTVIClientEvent(
    RTVIEvent.BotLlmText,
    useCallback(
      (data: BotLLMTextData) => {
        if (data.text.trim()) {
          updateOrAddMessage(data.text.trim(), "bot", false);
        }
      },
      [updateOrAddMessage]
    )
  );

  // Listen for when bot stops generating text
  useRTVIClientEvent(
    RTVIEvent.BotLlmStopped,
    useCallback(() => {
      // Mark the current bot message as final
      setMessages((prev) => {
        const streamingId = streamingMessageRef.current.bot;
        if (!streamingId) return prev;

        const existingIndex = prev.findIndex((m) => m.id === streamingId);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            isFinal: true,
          };
          streamingMessageRef.current.bot = undefined;
          return updated;
        }
        return prev;
      });
    }, [])
  );

  return (
    <div className="chatbot-container">
      <div className="chatbot-header">
        <h3>Conversation</h3>
      </div>
      <div className="chatbot-messages">
        {messages.length === 0 ? (
          <div className="chatbot-empty-state">
            <p>No messages yet. Start a conversation to see it here!</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`chatbot-message chatbot-message-${message.sender}`}
            >
              <div className="chatbot-message-content">
                <div
                  className={`chatbot-message-text ${
                    !message.isFinal ? "chatbot-message-streaming" : ""
                  }`}
                >
                  {message.text}
                </div>
                <div className="chatbot-message-time">
                  {message.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
