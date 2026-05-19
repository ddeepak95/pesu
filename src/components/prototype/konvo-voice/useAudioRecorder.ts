"use client";

import { useCallback, useRef, useState } from "react";

export interface UseAudioRecorderResult {
  isRecording: boolean;
  recordingSessionId: number;
  audioBlob: Blob | null;
  analyser: AnalyserNode | null;
  /** Call synchronously inside a click handler before any await. */
  primeAudio: () => void;
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<Blob | null>;
  clearRecording: () => void;
  error: string | null;
}

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "";
}

function waitForRecorderFlush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 150));
}

export function useAudioRecorder(): UseAudioRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSessionId, setRecordingSessionId] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm");
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const sessionIdRef = useRef(0);
  const activeSessionRef = useRef(0);

  const primeAudio = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContextRef.current = new AudioContext();
    }
    void audioContextRef.current.resume();
  }, []);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const closeAudioGraph = useCallback(() => {
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    setAnalyser(null);
  }, []);

  const closeAudioContext = useCallback(() => {
    closeAudioGraph();
    const ctx = audioContextRef.current;
    audioContextRef.current = null;
    if (ctx && ctx.state !== "closed") {
      void ctx.close();
    }
  }, [closeAudioGraph]);

  const getAccumulatedBlob = useCallback((): Blob | null => {
    if (chunksRef.current.length === 0) return null;
    return new Blob(chunksRef.current, { type: mimeTypeRef.current });
  }, []);

  const abortCurrentSession = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state === "recording") {
        try {
          recorder.stop();
        } catch {
          // ignore
        }
      }
    }
    stopTracks();
    closeAudioContext();
    setIsRecording(false);
  }, [stopTracks, closeAudioContext]);

  const startRecording = useCallback(async (): Promise<boolean> => {
    setError(null);
    setAudioBlob(null);
    chunksRef.current = [];

    if (mediaRecorderRef.current?.state === "recording") {
      return true;
    }

    abortCurrentSession();

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError("Microphone is not available in this browser.");
      return false;
    }

    const sessionId = ++sessionIdRef.current;
    activeSessionRef.current = sessionId;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (activeSessionRef.current !== sessionId) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }

      const [track] = stream.getAudioTracks();
      if (!track || track.readyState !== "live") {
        stream.getTracks().forEach((t) => t.stop());
        setError("Microphone track is not active.");
        return false;
      }

      streamRef.current = stream;

      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        audioContextRef.current = new AudioContext();
      }
      const audioContext = audioContextRef.current;
      await audioContext.resume();

      if (activeSessionRef.current !== sessionId) {
        abortCurrentSession();
        return false;
      }

      closeAudioGraph();

      const node = audioContext.createAnalyser();
      node.fftSize = 256;
      node.smoothingTimeConstant = 0.72;
      node.minDecibels = -85;
      node.maxDecibels = -20;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      const monitorGain = audioContext.createGain();
      monitorGain.gain.value = 0;
      source.connect(node);
      node.connect(monitorGain);
      monitorGain.connect(audioContext.destination);

      if (audioContext.state !== "running") {
        await audioContext.resume();
      }

      setAnalyser(node);
      setRecordingSessionId(sessionId);

      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mimeTypeRef.current = recorder.mimeType || mimeType || "audio/webm";
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onerror = () => {
        if (activeSessionRef.current !== sessionId) return;
        setError("Recording failed");
        setIsRecording(false);
        abortCurrentSession();
      };

      recorder.start(250);
      setIsRecording(true);
      return true;
    } catch (e) {
      if (activeSessionRef.current === sessionId) {
        activeSessionRef.current = 0;
      }
      const msg =
        e instanceof Error ? e.message : "Could not access microphone";
      setError(msg);
      abortCurrentSession();
      return false;
    }
  }, [abortCurrentSession, closeAudioGraph, stopTracks]);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      const sessionId = activeSessionRef.current;

      if (!recorder || recorder.state !== "recording") {
        const blob = getAccumulatedBlob();
        setIsRecording(false);
        resolve(blob);
        return;
      }

      recorder.onstop = () => {
        void (async () => {
          await waitForRecorderFlush();
          const blob = getAccumulatedBlob();
          if (blob) setAudioBlob(blob);
          setIsRecording(false);
          stopTracks();
          closeAudioGraph();
          mediaRecorderRef.current = null;
          if (activeSessionRef.current === sessionId) {
            activeSessionRef.current = 0;
          }
          resolve(blob);
        })();
      };

      try {
        recorder.requestData();
      } catch {
        // optional
      }
      recorder.stop();
    });
  }, [getAccumulatedBlob, closeAudioGraph, stopTracks]);

  const clearRecording = useCallback(() => {
    setAudioBlob(null);
    chunksRef.current = [];
  }, []);

  return {
    isRecording,
    recordingSessionId,
    audioBlob,
    analyser,
    primeAudio,
    startRecording,
    stopRecording,
    clearRecording,
    error,
  };
}
