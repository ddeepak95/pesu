export type SpeechProviderId = "openai" | "cartesia" | "sarvam";

export interface TranscribeInput {
  audio: Buffer;
  filename: string;
  mimeType?: string;
  language?: string;
  apiModelId?: string;
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
