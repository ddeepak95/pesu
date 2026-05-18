export type SpeechProviderId = "openai";

export interface TranscribeInput {
  audio: Buffer;
  filename: string;
  mimeType?: string;
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
}

export interface SynthesizeResult {
  audio: Buffer;
  mimeType: string;
}

export interface TtsProvider {
  readonly id: SpeechProviderId;
  readonly supportsStream: boolean;
  synthesize(input: SynthesizeInput): Promise<SynthesizeResult>;
  synthesizeStream?(input: SynthesizeInput): AsyncIterable<Uint8Array>;
}
