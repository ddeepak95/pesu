import "server-only";

import WebSocket from "ws";
import { toSarvamLanguageCode } from "./language";
import { getSarvamApiKey, sarvamHeaders } from "./client";
import { SARVAM_TTS_SAMPLE_RATE } from "./tts";

export const SARVAM_WS_TTS_MIME = "audio/L16;rate=24000";

const SARVAM_WS_BASE = "wss://api.sarvam.ai/text-to-speech/ws";

export interface SarvamTtsWebSocketConfig {
  modelId: string;
  speaker: string;
  language: string;
  sampleRate?: number;
  minBufferSize?: number;
  maxChunkLength?: number;
}

interface SarvamWsAudioMessage {
  type: "audio";
  data?: {
    audio?: string;
    content_type?: string;
    request_id?: string;
  };
}

interface SarvamWsEventMessage {
  type: "event";
  data?: {
    event_type?: string;
    message?: string;
  };
}

interface SarvamWsErrorMessage {
  type: "error";
  data?: {
    message?: string;
    code?: number;
  };
}

type SarvamWsInboundMessage =
  | SarvamWsAudioMessage
  | SarvamWsEventMessage
  | SarvamWsErrorMessage
  | { type: string };

export class SarvamTtsWebSocketSession {
  readonly sampleRate: number;

  private ws: WebSocket | null = null;
  private readonly config: SarvamTtsWebSocketConfig;
  private readonly targetLanguageCode: string;
  private closed = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  private constructor(config: SarvamTtsWebSocketConfig) {
    this.config = config;
    this.sampleRate = config.sampleRate ?? SARVAM_TTS_SAMPLE_RATE;
    this.targetLanguageCode = toSarvamLanguageCode(config.language);
  }

  static async open(
    config: SarvamTtsWebSocketConfig,
  ): Promise<SarvamTtsWebSocketSession> {
    const session = new SarvamTtsWebSocketSession(config);
    await session.connect();
    return session;
  }

  private buildWsUrl(): string {
    const model = encodeURIComponent(this.config.modelId);
    return `${SARVAM_WS_BASE}?model=${model}&send_completion_event=true`;
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const headers = sarvamHeaders() as Record<string, string>;
      const ws = new WebSocket(this.buildWsUrl(), { headers });

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        ws.off("open", onOpen);
        ws.off("error", onError);
      };

      const onOpen = () => {
        cleanup();
        this.ws = ws;
        try {
          this.sendConfig();
          this.startPing();
          resolve();
        } catch (error) {
          reject(error instanceof Error ? error : new Error("Sarvam TTS setup failed"));
        }
      };

      ws.once("open", onOpen);
      ws.once("error", onError);
    });
  }

  private sendConfig(): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Sarvam TTS WebSocket is not connected.");
    }

    ws.send(
      JSON.stringify({
        type: "config",
        data: {
          model: this.config.modelId,
          target_language_code: this.targetLanguageCode,
          speaker: this.config.speaker,
          speech_sample_rate: this.sampleRate,
          output_audio_codec: "linear16",
          output_audio_bitrate: "128k",
          min_buffer_size: this.config.minBufferSize ?? 50,
          max_chunk_length: this.config.maxChunkLength ?? 150,
        },
      }),
    );
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (this.closed) return;
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "ping" }));
    }, 20_000);
  }

  pushText(text: string): void {
    if (this.closed || !text) return;
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Sarvam TTS WebSocket is not connected.");
    }
    ws.send(JSON.stringify({ type: "text", data: { text } }));
  }

  flush(): void {
    if (this.closed) return;
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "flush" }));
  }

  async *consumeAudio(): AsyncGenerator<Uint8Array> {
    const ws = this.ws;
    if (!ws) {
      throw new Error("Sarvam TTS WebSocket is not connected.");
    }

    const queue: Uint8Array[] = [];
    let pendingError: Error | null = null;
    let streamDone = false;
    let notify: (() => void) | null = null;

    const wake = () => {
      notify?.();
      notify = null;
    };

    const onMessage = (raw: WebSocket.RawData) => {
      let message: SarvamWsInboundMessage;
      try {
        message = JSON.parse(raw.toString()) as SarvamWsInboundMessage;
      } catch {
        return;
      }

      if (message.type === "audio") {
        const audio = (message as SarvamWsAudioMessage).data?.audio;
        if (audio) {
          queue.push(Buffer.from(audio, "base64"));
        }
        wake();
        return;
      }

      if (message.type === "event") {
        const eventType = (message as SarvamWsEventMessage).data?.event_type;
        if (eventType === "final") {
          streamDone = true;
          wake();
        }
        return;
      }

      if (message.type === "error") {
        const err = message as SarvamWsErrorMessage;
        pendingError = new Error(
          err.data?.message ?? "Sarvam TTS WebSocket error",
        );
        streamDone = true;
        wake();
      }
    };

    const onWsError = (error: Error) => {
      pendingError = error;
      streamDone = true;
      wake();
    };

    ws.on("message", onMessage);
    ws.on("error", onWsError);

    try {
      while (!streamDone || queue.length > 0) {
        if (pendingError) {
          throw pendingError;
        }
        if (queue.length > 0) {
          yield queue.shift()!;
          continue;
        }
        if (streamDone) break;
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
      }
      if (pendingError) {
        throw pendingError;
      }
    } finally {
      ws.off("message", onMessage);
      ws.off("error", onWsError);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    } else if (ws) {
      ws.terminate();
    }
  }
}

export function isSarvamApiKeyConfigured(): boolean {
  try {
    getSarvamApiKey();
    return true;
  } catch {
    return false;
  }
}
