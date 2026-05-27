"use client";

import { useCallback, useRef, useState } from "react";
import { OPENAI_TTS_SAMPLE_RATE } from "@/lib/konvo-voice/speech/config";

const DEFAULT_SAMPLE_RATE = OPENAI_TTS_SAMPLE_RATE;

export interface SpeechPlaybackHandlers {
  onPlaybackStart?: () => void;
  onSegmentStart?: (index: number) => void;
  onSegmentEnd?: (index: number) => void;
  onAllEnd?: () => void;
}

interface SegmentState {
  index: number;
  finalized: boolean;
  started: boolean;
  playbackStartFired: boolean;
  /** Leftover byte when a chunk splits a 16-bit sample. */
  pendingBytes: Uint8Array;
  rawChunks: Uint8Array[];
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function pcm16ToFloat32(bytes: Uint8Array): Float32Array {
  const sampleCount = Math.floor(bytes.length / 2);
  const out = new Float32Array(sampleCount);
  const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
  for (let i = 0; i < sampleCount; i++) {
    out[i] = view.getInt16(i * 2, true) / 32768;
  }
  return out;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useStreamingSpeechPlayback() {
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const abortRef = useRef<AbortController | null>(null);
  const segmentsRef = useRef<Map<number, SegmentState>>(new Map());
  const handlersRef = useRef<SpeechPlaybackHandlers>({});
  const nextPlayableIndexRef = useRef(0);
  const nextScheduleTimeRef = useRef(0);

  const sampleRateRef = useRef(DEFAULT_SAMPLE_RATE);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const playbackStartFiredRef = useRef(false);

  const [playbackAnalyser, setPlaybackAnalyser] = useState<AnalyserNode | null>(
    null,
  );

  const ensureAudioGraph = useCallback(() => {
    const rate = sampleRateRef.current;
    if (
      !audioContextRef.current ||
      audioContextRef.current.sampleRate !== rate
    ) {
      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
      audioContextRef.current = new AudioContext({ sampleRate: rate });
      analyserRef.current = null;
    }
    if (!analyserRef.current) {
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      analyser.minDecibels = -85;
      analyser.maxDecibels = -20;
      analyser.connect(audioContextRef.current.destination);
      analyserRef.current = analyser;
      setPlaybackAnalyser(analyser);
    }
    return { ctx: audioContextRef.current, analyser: analyserRef.current };
  }, []);

  const stopActiveSources = useCallback(() => {
    for (const source of activeSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    activeSourcesRef.current = [];
  }, []);

  const firePlaybackStart = useCallback(() => {
    if (playbackStartFiredRef.current) return;
    if (abortRef.current?.signal.aborted) return;
    playbackStartFiredRef.current = true;
    handlersRef.current.onPlaybackStart?.();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    segmentsRef.current.clear();
    nextPlayableIndexRef.current = 0;
    nextScheduleTimeRef.current = 0;
    playbackStartFiredRef.current = false;
    queueRef.current = Promise.resolve();
    stopActiveSources();
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setPlaybackAnalyser(null);
  }, [stopActiveSources]);

  const getOrCreateSegment = useCallback((index: number): SegmentState => {
    let state = segmentsRef.current.get(index);
    if (!state) {
      state = {
        index,
        finalized: false,
        started: false,
        playbackStartFired: false,
        pendingBytes: new Uint8Array(0),
        rawChunks: [],
      };
      segmentsRef.current.set(index, state);
    }
    return state;
  }, []);

  const schedulePcm = useCallback(
    (samples: Float32Array, index: number) => {
      if (samples.length === 0) return;
      const signal = abortRef.current?.signal;
      if (!signal || signal.aborted) return;

      const { ctx, analyser } = ensureAudioGraph();
      void ctx.resume();

      const buffer = ctx.createBuffer(1, samples.length, sampleRateRef.current);
      buffer.getChannelData(0).set(samples);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(analyser);
      activeSourcesRef.current.push(source);

      const startAt = Math.max(
        ctx.currentTime + 0.02,
        nextScheduleTimeRef.current,
      );
      source.start(startAt);
      nextScheduleTimeRef.current = startAt + buffer.duration;

      if (!playbackStartFiredRef.current) {
        firePlaybackStart();
        handlersRef.current.onSegmentStart?.(index);
      }
    },
    [ensureAudioGraph, firePlaybackStart],
  );

  const drainSegmentPcm = useCallback(
    (state: SegmentState, flushPartial: boolean) => {
      let bytes = state.pendingBytes;
      state.pendingBytes = new Uint8Array(0);

      for (const chunk of state.rawChunks) {
        bytes = concatBytes(bytes, chunk);
      }
      state.rawChunks = [];

      const evenLength = flushPartial
        ? bytes.length - (bytes.length % 2)
        : bytes.length - (bytes.length % 2);

      if (evenLength > 0) {
        const playable = bytes.subarray(0, evenLength);
        const remainder = bytes.subarray(evenLength);
        state.pendingBytes = remainder;

        if (!state.started) {
          state.started = true;
        }
        schedulePcm(pcm16ToFloat32(playable), state.index);
      } else if (flushPartial && bytes.length > 0) {
        state.pendingBytes = bytes;
      }
    },
    [schedulePcm],
  );

  const tryDrainSegment = useCallback(
    (index: number, flushPartial: boolean) => {
      if (index !== nextPlayableIndexRef.current) return;
      const state = segmentsRef.current.get(index);
      if (!state) return;
      if (state.rawChunks.length === 0 && state.pendingBytes.length < 2) {
        return;
      }
      drainSegmentPcm(state, flushPartial);
    },
    [drainSegmentPcm],
  );

  const waitForScheduleEnd = useCallback(async () => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    const waitSec = nextScheduleTimeRef.current - ctx.currentTime;
    if (waitSec > 0) {
      await sleepMs(waitSec * 1000 + 30);
    }
  }, []);

  const finishSegment = useCallback(
    async (index: number) => {
      const state = segmentsRef.current.get(index);
      if (!state) return;

      state.finalized = true;
      drainSegmentPcm(state, true);
      await waitForScheduleEnd();
      handlersRef.current.onSegmentEnd?.(index);
      segmentsRef.current.delete(index);
    },
    [drainSegmentPcm, waitForScheduleEnd],
  );

  const onSegmentPlaybackDone = useCallback(
    (index: number) => {
      if (index === nextPlayableIndexRef.current) {
        nextPlayableIndexRef.current += 1;
      }
      tryDrainSegment(nextPlayableIndexRef.current, false);
    },
    [tryDrainSegment],
  );

  const prepareSegment = useCallback(
    (index: number, format?: { sampleRate?: number }) => {
      if (format?.sampleRate && format.sampleRate > 0) {
        sampleRateRef.current = format.sampleRate;
      }
      getOrCreateSegment(index);
    },
    [getOrCreateSegment],
  );

  const appendChunk = useCallback(
    (index: number, base64: string) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const state = getOrCreateSegment(index);
      state.rawChunks.push(bytes);

      const signal = abortRef.current?.signal;
      if (!signal || signal.aborted) return;

      tryDrainSegment(index, false);
    },
    [getOrCreateSegment, tryDrainSegment],
  );

  const endSegment = useCallback(
    (index: number, handlers?: SpeechPlaybackHandlers) => {
      if (handlers) {
        handlersRef.current = { ...handlersRef.current, ...handlers };
      }

      queueRef.current = queueRef.current
        .then(async () => {
          try {
            await finishSegment(index);
            onSegmentPlaybackDone(index);
          } catch {
            onSegmentPlaybackDone(index);
          }
        })
        .catch(() => undefined);
      return queueRef.current;
    },
    [finishSegment, onSegmentPlaybackDone],
  );

  const waitForAll = useCallback((handlers?: SpeechPlaybackHandlers) => {
    if (handlers) {
      handlersRef.current = { ...handlersRef.current, ...handlers };
    }
    queueRef.current = queueRef.current
      .then(() => {
        handlersRef.current.onAllEnd?.();
      })
      .catch(() => {
        handlersRef.current.onAllEnd?.();
      });
    return queueRef.current;
  }, []);

  const beginTurn = useCallback(
    (handlers?: SpeechPlaybackHandlers) => {
      reset();
      sampleRateRef.current = DEFAULT_SAMPLE_RATE;
      abortRef.current = new AbortController();
      if (handlers) handlersRef.current = handlers;
      const { ctx } = ensureAudioGraph();
      void ctx.resume();
      nextScheduleTimeRef.current = ctx.currentTime + 0.05;
    },
    [reset, ensureAudioGraph],
  );

  const setHandlers = useCallback((handlers: SpeechPlaybackHandlers) => {
    handlersRef.current = { ...handlersRef.current, ...handlers };
  }, []);

  const releasePlayback = useCallback(() => {
    stopActiveSources();
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setPlaybackAnalyser(null);
  }, [stopActiveSources]);

  return {
    beginTurn,
    reset,
    releasePlayback,
    prepareSegment,
    appendChunk,
    endSegment,
    waitForAll,
    setHandlers,
    playbackAnalyser,
    setActiveIndex: (index: number) => {
      getOrCreateSegment(index);
    },
  };
}
