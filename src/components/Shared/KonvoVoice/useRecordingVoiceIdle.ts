"use client";

import { useEffect, useRef, useState } from "react";

const SEND_NUDGE_QUIET_MS = 7000;
const RECORDING_GRACE_MS = 1500;
const VOICE_RMS_THRESHOLD = 0.035;
const MIN_BURST_MS = 300;
const SUSTAINED_SPEECH_MS = 500;
const SAMPLE_INTERVAL_MS = 100;

function measureRms(analyser: AnalyserNode): number {
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const d = (data[i] - 128) / 128;
    sum += d * d;
  }
  return Math.sqrt(sum / data.length);
}

/**
 * Hybrid send nudge: 7s quiet shows rings; short noise ignored before show;
 * sustained speech required to hide rings once visible.
 */
export function useRecordingVoiceIdle(
  enabled: boolean,
  analyser: AnalyserNode | null,
): boolean {
  const [showSendNudge, setShowSendNudge] = useState(false);
  const quietMsRef = useRef(0);
  const loudStreakMsRef = useRef(0);
  const recordingStartRef = useRef(0);
  const showNudgeRef = useRef(false);

  useEffect(() => {
    showNudgeRef.current = showSendNudge;
  }, [showSendNudge]);

  useEffect(() => {
    if (!enabled || !analyser) {
      return;
    }

    recordingStartRef.current = performance.now();
    quietMsRef.current = 0;
    loudStreakMsRef.current = 0;

    const intervalId = window.setInterval(() => {
      const rms = measureRms(analyser);
      const isLoud = rms >= VOICE_RMS_THRESHOLD;
      const elapsed = performance.now() - recordingStartRef.current;

      if (elapsed < RECORDING_GRACE_MS) {
        return;
      }

      if (!showNudgeRef.current) {
        if (isLoud) {
          loudStreakMsRef.current += SAMPLE_INTERVAL_MS;
          if (loudStreakMsRef.current >= MIN_BURST_MS) {
            quietMsRef.current = 0;
          }
        } else {
          loudStreakMsRef.current = 0;
          quietMsRef.current += SAMPLE_INTERVAL_MS;
          if (quietMsRef.current >= SEND_NUDGE_QUIET_MS) {
            setShowSendNudge(true);
          }
        }
      } else if (isLoud) {
        loudStreakMsRef.current += SAMPLE_INTERVAL_MS;
        if (loudStreakMsRef.current >= SUSTAINED_SPEECH_MS) {
          setShowSendNudge(false);
          quietMsRef.current = 0;
          loudStreakMsRef.current = 0;
        }
      } else {
        loudStreakMsRef.current = 0;
      }
    }, SAMPLE_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      quietMsRef.current = 0;
      loudStreakMsRef.current = 0;
      setShowSendNudge(false);
    };
  }, [enabled, analyser]);

  return enabled && showSendNudge;
}
