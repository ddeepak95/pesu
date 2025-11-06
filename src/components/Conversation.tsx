"use client";

import React, { useRef } from "react";
import { usePipecatConversation } from "@pipecat-ai/voice-ui-kit";

export function Conversation() {
  const { messages } = usePipecatConversation();
  const endRef = useRef<HTMLDivElement>(null);

  return (
    <div
      style={{
        height: 300,
        overflow: "auto",
        fontFamily: "monospace",
        fontSize: 12,
      }}
    >
      {messages.map((m, i) => (
        <div key={i}>
          <strong>[{m.role}]</strong>{" "}
          {m.parts.map((part, j) => (
            <span key={j}>
              {typeof part.text === "string" ? part.text : "[component]"}
            </span>
          ))}
          <span style={{ opacity: 0.6, marginLeft: 8 }}>
            {new Date(m.createdAt).toLocaleTimeString()}
          </span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
