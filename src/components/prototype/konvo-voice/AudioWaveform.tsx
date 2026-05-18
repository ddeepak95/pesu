"use client";

import { useEffect, useRef } from "react";

interface AudioWaveformProps {
  analyser?: AnalyserNode | null;
  active?: boolean;
  barCount?: number;
  className?: string;
}

export function AudioWaveform({
  analyser,
  active = false,
  barCount = 32,
  className = "",
}: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const drawIdle = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const gap = w / barCount;
      for (let i = 0; i < barCount; i++) {
        const barH = h * (0.15 + Math.sin(i * 0.5) * 0.05);
        const x = i * gap + gap * 0.25;
        const bw = gap * 0.5;
        ctx.fillStyle = "currentColor";
        ctx.globalAlpha = 0.35;
        ctx.fillRect(x, (h - barH) / 2, bw, barH);
      }
      ctx.globalAlpha = 1;
    };

    if (!active || !analyser) {
      drawIdle();
      return;
    }

    const data = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      analyser.getByteFrequencyData(data);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const step = Math.floor(data.length / barCount);
      const gap = w / barCount;

      for (let i = 0; i < barCount; i++) {
        const v = data[i * step] / 255;
        const barH = Math.max(4, v * h * 0.9);
        const x = i * gap + gap * 0.2;
        const bw = gap * 0.6;
        ctx.fillStyle = "currentColor";
        ctx.fillRect(x, (h - barH) / 2, bw, barH);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyser, active, barCount]);

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={48}
      className={`w-full max-w-full h-12 text-foreground ${className}`}
      aria-hidden
    />
  );
}
