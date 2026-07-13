export type SpeechProviderId = "openai" | "cartesia" | "sarvam";

export interface TranscribeInput {
  audio: Buffer;
  filename: string;
  mimeType?: string;
  language?: string;
  apiModelId?: string;
  providerApiKey?: string;
  /**
   * Client-reported duration (spoofable — §10 #8), used only when the
   * provider itself returns no usable duration (e.g. Sarvam, or OpenAI's
   * token-billed usage variant). Read only by the gateway's metering wrapper,
   * not by provider clients.
   */
  fallbackAudioMs?: number | null;
}

/** Usage/duration metadata a provider returns (or the caller measures) for one call — §5.1. */
export interface SpeechUsage {
  /** STT input duration, when known. */
  audioMs?: number | null;
  providerTokens?: { input?: number; output?: number; audio?: number } | null;
  source: "provider" | "measured" | "estimated";
  providerRequestId?: string | null;
  /** Provider usage/duration blob, kept for invoice reconciliation. */
  raw?: unknown;
}

export interface TranscribeResult {
  text: string;
  usage?: SpeechUsage;
}

export interface SttProvider {
  readonly id: SpeechProviderId;
  readonly supportsStream: boolean;
  transcribe(input: TranscribeInput): Promise<TranscribeResult>;
}

export interface SynthesizeInput {
  text: string;
  voice?: string;
  language?: string;
  apiModelId?: string;
  providerApiKey?: string;
  /** Provider-specific continuation context id (Cartesia). */
  contextId?: string;
  /** Provider-specific continuation flag (Cartesia). */
  continueGeneration?: boolean;
}

export interface SynthesizeResult {
  audio: Buffer;
  mimeType: string;
}

export interface TtsStreamFormat {
  mimeType: string;
  sampleRate: number;
}

export interface TtsProvider {
  readonly id: SpeechProviderId;
  readonly supportsStream: boolean;
  readonly streamFormat: TtsStreamFormat;
  synthesize(input: SynthesizeInput): Promise<SynthesizeResult>;
  synthesizeStream?(input: SynthesizeInput): AsyncIterable<Uint8Array>;
}
