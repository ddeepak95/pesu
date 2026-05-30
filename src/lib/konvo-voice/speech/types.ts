export type SpeechProviderId = "openai" | "cartesia" | "sarvam";

export interface TranscribeInput {
  audio: Buffer;
  filename: string;
  mimeType?: string;
  language?: string;
  /**
   * Let the provider auto-detect the spoken language instead of forcing
   * `language`. Used when language support is enabled so a learner may speak
   * either the primary or the support language. Detection is per-utterance.
   */
  autoDetect?: boolean;
  apiModelId?: string;
  providerApiKey?: string;
}

export interface TranscribeResult {
  text: string;
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
