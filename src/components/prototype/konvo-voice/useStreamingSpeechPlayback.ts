"use client";

import { useCallback, useRef } from "react";

export interface SpeechPlaybackHandlers {
  onSegmentStart?: (index: number) => void;
  onSegmentEnd?: (index: number) => void;
  onAllEnd?: () => void;
}

export function useStreamingSpeechPlayback() {
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const abortRef = useRef<AbortController | null>(null);
  const segmentChunksRef = useRef<Map<number, Uint8Array[]>>(new Map());
  const activeIndexRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    segmentChunksRef.current.clear();
    activeIndexRef.current = null;
    queueRef.current = Promise.resolve();
  }, []);

  const playBuffer = useCallback(
    (buffer: ArrayBuffer, signal: AbortSignal): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (signal.aborted) {
          resolve();
          return;
        }
        const blob = new Blob([buffer], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        const cleanup = () => URL.revokeObjectURL(url);

        audio.onended = () => {
          cleanup();
          resolve();
        };
        audio.onerror = () => {
          cleanup();
          reject(new Error("Audio playback failed"));
        };
        signal.addEventListener("abort", () => {
          audio.pause();
          cleanup();
          resolve();
        });
        void audio.play().catch(reject);
      });
    },
    [],
  );

  const flushSegment = useCallback(
    async (index: number, handlers: SpeechPlaybackHandlers, signal: AbortSignal) => {
      const chunks = segmentChunksRef.current.get(index) ?? [];
      segmentChunksRef.current.delete(index);
      if (chunks.length === 0) return;

      const total = chunks.reduce((n, c) => n + c.length, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      handlers.onSegmentStart?.(index);
      await playBuffer(merged.buffer, signal);
      handlers.onSegmentEnd?.(index);
    },
    [playBuffer],
  );

  const appendChunk = useCallback((index: number, base64: string) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const list = segmentChunksRef.current.get(index) ?? [];
    list.push(bytes);
    segmentChunksRef.current.set(index, list);
  }, []);

  const endSegment = useCallback(
    (index: number, handlers: SpeechPlaybackHandlers) => {
      queueRef.current = queueRef.current
        .then(async () => {
          const signal = abortRef.current?.signal ?? new AbortController().signal;
          try {
            await flushSegment(index, handlers, signal);
          } catch {
            // Autoplay or decode errors should not block the conversation flow.
          }
        })
        .catch(() => undefined);
      return queueRef.current;
    },
    [flushSegment],
  );

  const waitForAll = useCallback(
    (handlers: SpeechPlaybackHandlers) => {
      queueRef.current = queueRef.current
        .then(() => {
          handlers.onAllEnd?.();
        })
        .catch(() => {
          handlers.onAllEnd?.();
        });
      return queueRef.current;
    },
    [],
  );

  const beginTurn = useCallback(() => {
    reset();
    abortRef.current = new AbortController();
  }, [reset]);

  return {
    beginTurn,
    reset,
    appendChunk,
    endSegment,
    waitForAll,
    setActiveIndex: (index: number) => {
      activeIndexRef.current = index;
    },
  };
}
