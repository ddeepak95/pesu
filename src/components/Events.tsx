"use client";
import React, { useRef, useState } from "react";
import {
  usePipecatEventStream,
  type PipecatEventGroup,
} from "@pipecat-ai/voice-ui-kit";

export function EventStreamExample() {
  const { groups } = usePipecatEventStream({
    maxEvents: 5000,
    groupConsecutive: true,
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const endRef = useRef<HTMLDivElement>(null);

  const toggleGroup = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div
      style={{
        height: 300,
        overflow: "auto",
        fontFamily: "monospace",
        fontSize: 12,
      }}
    >
      {groups.map((group: PipecatEventGroup) => {
        const isExpanded = expanded.has(group.id);
        const hasMultiple = group.events.length > 1;

        if (!hasMultiple || isExpanded) {
          return group.events.map((e, idx) => (
            <div key={e.id}>
              {hasMultiple && idx === 0 ? (
                <button onClick={() => toggleGroup(group.id)}>[−]</button>
              ) : (
                <span>•</span>
              )}
              <span> [{e.timestamp.toLocaleTimeString()}] </span>
              <strong>{e.type}</strong>{" "}
              {e.data ? JSON.stringify(e.data) : "null"}
            </div>
          ));
        }

        return (
          <div key={group.id}>
            <button onClick={() => toggleGroup(group.id)}>[+]</button>
            <span> [{group.events[0].timestamp.toLocaleTimeString()}] </span>
            <strong>{group.type}</strong> ({group.events.length} events)
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
