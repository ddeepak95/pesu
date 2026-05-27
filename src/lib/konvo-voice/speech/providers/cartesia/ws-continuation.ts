import "server-only";

import { randomUUID } from "crypto";
import WebSocket from "ws";
import { getProviderLanguageCodeForKonvo } from "@/lib/konvo-voice/konvoLocaleCapabilitiesHelpers";
import { CARTESIA_API_VERSION, cartesiaHeaders, getCartesiaApiKey } from "./client";
import { CARTESIA_TTS_SAMPLE_RATE } from "./tts";

const CARTESIA_WS_URL = `wss://api.cartesia.ai/tts/websocket?cartesia_version=${CARTESIA_API_VERSION}`;

export interface CartesiaTtsContinuationConfig {
  modelId: string;
  voiceId: string;
  language: string;
  contextId?: string;
  sampleRate?: number;
  maxBufferDelayMs?: number;
}

interface CartesiaWsChunkMessage {
  type: "chunk";
  data?: string;
  done: boolean;
  context_id: string;
  status_code?: number;
}

interface CartesiaWsDoneMessage {
  type: "done";
  done: boolean;
  context_id: string;
  status_code?: number;
}

interface CartesiaWsErrorMessage {
  type: "error";
  context_id?: string;
  message?: string;
  status_code?: number;
}

type CartesiaWsInboundMessage =
  | CartesiaWsChunkMessage
  | CartesiaWsDoneMessage
  | CartesiaWsErrorMessage
  | { type: string; context_id?: string };

export class CartesiaTtsContinuationSession {
  readonly contextId: string;
  readonly sampleRate: number;

  private ws: WebSocket | null = null;
  private readonly config: CartesiaTtsContinuationConfig;
  private readonly languageCode: string;
  private closed = false;
  private cancelled = false;

  private constructor(config: CartesiaTtsContinuationConfig) {
    this.config = config;
    this.contextId = config.contextId ?? randomUUID();
    this.sampleRate = config.sampleRate ?? CARTESIA_TTS_SAMPLE_RATE;
    this.languageCode = getProviderLanguageCodeForKonvo(config.language);
  }

  static async open(
    config: CartesiaTtsContinuationConfig,
  ): Promise<CartesiaTtsContinuationSession> {
    const session = new CartesiaTtsContinuationSession(config);
    await session.connect();
    return session;
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const headers = cartesiaHeaders() as Record<string, string>;
      const ws = new WebSocket(CARTESIA_WS_URL, { headers });

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
        resolve();
      };

      ws.once("open", onOpen);
      ws.once("error", onError);
    });
  }

  pushTranscript(transcript: string, continueGeneration: boolean): void {
    if (this.closed || this.cancelled) return;
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Cartesia TTS WebSocket is not connected.");
    }

    ws.send(
      JSON.stringify({
        model_id: this.config.modelId,
        transcript,
        voice: { mode: "id", id: this.config.voiceId },
        output_format: {
          container: "raw",
          encoding: "pcm_s16le",
          sample_rate: this.sampleRate,
        },
        language: this.languageCode,
        context_id: this.contextId,
        continue: continueGeneration,
        max_buffer_delay_ms: this.config.maxBufferDelayMs ?? 3000,
      }),
    );
  }

  cancelContext(): void {
    if (this.closed || this.cancelled) return;
    this.cancelled = true;
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        context_id: this.contextId,
        cancel: true,
      }),
    );
  }

  async *consumeAudio(): AsyncGenerator<Uint8Array> {
    const ws = this.ws;
    if (!ws) {
      throw new Error("Cartesia TTS WebSocket is not connected.");
    }

    const queue: Uint8Array[] = [];
    let pendingError: Error | null = null;
    let contextDone = false;
    let notify: (() => void) | null = null;

    const wake = () => {
      notify?.();
      notify = null;
    };

    const onMessage = (raw: WebSocket.RawData) => {
      let message: CartesiaWsInboundMessage;
      try {
        message = JSON.parse(raw.toString()) as CartesiaWsInboundMessage;
      } catch {
        return;
      }

      if (message.context_id && message.context_id !== this.contextId) {
        return;
      }

      if (message.type === "chunk") {
        const chunk = message as CartesiaWsChunkMessage;
        if (chunk.data) {
          queue.push(Buffer.from(chunk.data, "base64"));
        }
        if (chunk.done) {
          contextDone = true;
        }
        wake();
        return;
      }

      if (message.type === "done") {
        contextDone = true;
        wake();
        return;
      }

      if (message.type === "error") {
        const err = message as CartesiaWsErrorMessage;
        pendingError = new Error(
          err.message ?? `Cartesia TTS WebSocket error (${err.status_code ?? "unknown"})`,
        );
        contextDone = true;
        wake();
      }
    };

    const onWsError = (error: Error) => {
      pendingError = error;
      contextDone = true;
      wake();
    };

    ws.on("message", onMessage);
    ws.on("error", onWsError);

    try {
      while (!contextDone || queue.length > 0) {
        if (pendingError) {
          throw pendingError;
        }
        if (queue.length > 0) {
          yield queue.shift()!;
          continue;
        }
        if (contextDone) break;
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
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    } else if (ws) {
      ws.terminate();
    }
  }
}

export function isCartesiaApiKeyConfigured(): boolean {
  try {
    getCartesiaApiKey();
    return true;
  } catch {
    return false;
  }
}
