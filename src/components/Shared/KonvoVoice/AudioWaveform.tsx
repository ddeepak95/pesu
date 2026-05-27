"use client";

import { useEffect, useRef } from "react";
import type { WaveMode } from "./uiState";

interface AudioWaveformProps {
  mode?: WaveMode;
  analyser?: AnalyserNode | null;
  active?: boolean;
  barCount?: number;
  className?: string;
  height?: number;
}

const DEFAULT_DISPLAY_HEIGHT = 56;

/** Bar width as a fraction of each slot (lower = more gap). */
const BAR_WIDTH_RATIO = 0.46;

function barCountForWidth(width: number, requested: number): number {
  if (requested > 0) return requested;
  return Math.min(28, Math.max(16, Math.floor(width / 14)));
}

function barLayout(barIndex: number, barCount: number, width: number) {
  const slot = width / barCount;
  const barW = slot * BAR_WIDTH_RATIO;
  const x = barIndex * slot + (slot - barW) / 2;
  return { x, barW, slot };
}

function centerMetrics(barCount: number) {
  const mid = (barCount - 1) / 2;
  return { mid, halfSpan: mid || 1 };
}

/** 1 at center bar(s), 0 at outer edges — symmetric hill. */
function centerEnvelope(barIndex: number, barCount: number): number {
  const { mid, halfSpan } = centerMetrics(barCount);
  const distFromCenter = Math.abs(barIndex - mid) / halfSpan;
  return Math.cos((distFromCenter * Math.PI) / 2);
}

/**
 * Perceptual curve: spreads mid-level detail, keeps loud levels from pinning at 1.0.
 * Equivalent in spirit to log / dB compression for visualization.
 */
function compressAmplitude(linear: number): number {
  if (linear <= 0) return 0;
  const k = 14;
  return Math.log1p(linear * k) / Math.log1p(k);
}

/** Map dB (from AnalyserNode float data) into 0–1, then compress. */
function dbToLevel(db: number, minDb: number, maxDb: number): number {
  if (!Number.isFinite(db)) return 0;
  const span = maxDb - minDb;
  if (span <= 0) return 0;
  const linear = Math.max(0, Math.min(1, (db - minDb) / span));
  return compressAmplitude(linear);
}

/** Map spectrum bins by distance from center so L/R mirror the same frequencies. */
function sampleCenteredSpectrumDb(
  freqDb: Float32Array,
  barCount: number,
  minDb: number,
  maxDb: number,
): number[] {
  const { mid, halfSpan } = centerMetrics(barCount);
  const binMax = freqDb.length - 1;
  const bandwidth = Math.max(1, Math.floor(binMax / barCount / 2));
  const values: number[] = [];

  for (let i = 0; i < barCount; i++) {
    const dist = Math.abs(i - mid) / halfSpan;
    const centerBin = Math.floor(dist * binMax);
    let sum = 0;
    let count = 0;
    for (let b = centerBin - bandwidth; b <= centerBin + bandwidth; b++) {
      if (b >= 0 && b < freqDb.length) {
        sum += freqDb[b] ?? minDb;
        count++;
      }
    }
    const avgDb = count > 0 ? sum / count : minDb;
    values.push(dbToLevel(avgDb, minDb, maxDb));
  }

  return values;
}

export function AudioWaveform({
  mode = "audio",
  analyser,
  active = false,
  barCount: requestedBarCount = 0,
  className = "",
  height = DEFAULT_DISPLAY_HEIGHT,
}: AudioWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const activeRef = useRef(false);
  const modeRef = useRef(mode);
  const smoothedRef = useRef<number[]>([]);
  const peakHoldRef = useRef(0.28);
  const drawColorRef = useRef<string>("#000000");

  useEffect(() => {
    analyserRef.current = analyser ?? null;
    activeRef.current = active;
    modeRef.current = mode;
  }, [analyser, active, mode]);

  useEffect(() => {
    if (mode === "none") return;

    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const width = Math.max(container.clientWidth, 120);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const computed = window.getComputedStyle(container).color;
      if (computed) {
        drawColorRef.current = computed;
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    /** Center-anchored hill: whole shape breathes in/out symmetrically. */
    const drawThinking = (t: number, w: number, h: number, barCount: number) => {
      ctx.clearRect(0, 0, w, h);
      const breath = 0.5 + 0.5 * Math.sin(t * 0.002);
      const minH = 0.18;
      const maxAmp = 0.76;

      for (let i = 0; i < barCount; i++) {
        const envelope = centerEnvelope(i, barCount);
        const barH = h * (minH + breath * envelope * maxAmp);
        const { x, barW } = barLayout(i, barCount, w);
        ctx.fillStyle = drawColorRef.current;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(x, (h - barH) / 2, barW, barH);
      }
      ctx.globalAlpha = 1;
    };

    const drawBars = (
      values: number[],
      w: number,
      h: number,
      minAlpha: number,
    ) => {
      ctx.clearRect(0, 0, w, h);
      const barCount = values.length;

      for (let i = 0; i < barCount; i++) {
        const normalized = Math.min(1, Math.max(0, values[i]));
        const barH = Math.max(4, normalized * h * 0.88);
        const { x, barW } = barLayout(i, barCount, w);
        ctx.fillStyle = drawColorRef.current;
        ctx.globalAlpha = minAlpha + normalized * (1 - minAlpha);
        ctx.fillRect(x, (h - barH) / 2, barW, barH);
      }
      ctx.globalAlpha = 1;
    };

    /** Slow AGC: tracks loud passages without pinning bars to full height each frame. */
    const applyAutoLevel = (values: number[]) => {
      let framePeak = 0;
      for (const v of values) {
        if (v > framePeak) framePeak = v;
      }
      const hold = peakHoldRef.current;
      if (framePeak > hold) {
        peakHoldRef.current = hold + (framePeak - hold) * 0.12;
      } else {
        peakHoldRef.current = hold + (framePeak - hold) * 0.04;
      }
      const floor = 0.2;
      const ceiling = 0.92;
      const gain = ceiling / Math.max(floor, peakHoldRef.current);
      return values.map((v) => compressAmplitude(Math.min(1, v * gain)));
    };

    const applyGate = (v: number, floor: number) =>
      v <= floor ? 0 : (v - floor) / (1 - floor);

    const smoothValues = (targets: number[]) => {
      const prev = smoothedRef.current;
      if (prev.length !== targets.length) {
        smoothedRef.current = targets.map((v) => v * 0.5);
      }
      const next = smoothedRef.current;
      const attack = 0.22;
      const release = 0.08;
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        const k = t > next[i] ? attack : release;
        next[i] += (t - next[i]) * k;
      }
      return next;
    };

    let freqDb = new Float32Array(128);
    let timeData = new Uint8Array(256);

    const ensureAnalyserRunning = (node: AnalyserNode) => {
      const audioCtx = node.context;
      if (audioCtx instanceof AudioContext && audioCtx.state === "suspended") {
        void audioCtx.resume();
      }
    };

    const draw = (t: number) => {
      const w = container.clientWidth || 120;
      const h = height;
      const barCount = barCountForWidth(w, requestedBarCount);
      const currentMode = modeRef.current;

      if (currentMode === "thinking") {
        drawThinking(t, w, h, barCount);
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const node = analyserRef.current;
      const isActive = activeRef.current && node;

      if (!isActive || !node) {
        smoothedRef.current = [];
        peakHoldRef.current = 0.28;
        const idle = Array.from(
          { length: barCount },
          (_, i) => 0.06 * centerEnvelope(i, barCount),
        );
        drawBars(idle, w, h, 0.28);
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      ensureAnalyserRunning(node);

      if (freqDb.length !== node.frequencyBinCount) {
        freqDb = new Float32Array(node.frequencyBinCount);
      }
      node.getFloatFrequencyData(freqDb);
      const raw = sampleCenteredSpectrumDb(
        freqDb,
        barCount,
        node.minDecibels,
        node.maxDecibels,
      );

      if (timeData.length !== node.fftSize) {
        timeData = new Uint8Array(node.fftSize);
      }
      node.getByteTimeDomainData(timeData);
      let rms = 0;
      for (let i = 0; i < timeData.length; i++) {
        const d = (timeData[i] - 128) / 128;
        rms += d * d;
      }
      rms = Math.sqrt(rms / timeData.length);

      const noiseFloor = 0.06;
      const rmsBoost =
        rms > 0.05 ? compressAmplitude(Math.min(0.2, (rms - 0.05) * 1.2)) : 0;

      const gated = raw.map((v) => {
        const mixed = applyGate(v, noiseFloor);
        return Math.min(1, mixed + rmsBoost * 0.15);
      });

      const smoothed = smoothValues(gated);
      const values = applyAutoLevel(smoothed);
      drawBars(values, w, h, 0.38);
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
      smoothedRef.current = [];
      peakHoldRef.current = 0.28;
    };
  }, [requestedBarCount, mode, analyser, active, height]);

  if (mode === "none") return null;

  return (
    <div
      ref={containerRef}
      className={`w-full max-w-md mx-auto text-foreground ${className}`}
      style={{ height }}
    >
      <canvas ref={canvasRef} className="block w-full" aria-hidden />
    </div>
  );
}
