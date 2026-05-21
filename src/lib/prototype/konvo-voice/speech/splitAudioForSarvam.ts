import { SARVAM_STT_MAX_DURATION_MS } from "./constants";
import { audioBufferSliceToWavBlob } from "./audioBufferToWav";

const SARVAM_CHUNK_SEC = SARVAM_STT_MAX_DURATION_MS / 1000;

/**
 * Split recorded audio into ≤30s WAV segments for Sarvam REST STT.
 * Returns a single-element array when under the limit or decode fails.
 */
export async function splitAudioForSarvam(blob: Blob): Promise<Blob[]> {
  if (typeof window === "undefined") {
    return [blob];
  }

  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new AudioContext();
    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

      if (audioBuffer.duration <= SARVAM_CHUNK_SEC) {
        return [blob];
      }

      const sampleRate = audioBuffer.sampleRate;
      const chunkSamples = Math.floor(SARVAM_CHUNK_SEC * sampleRate);
      const segments: Blob[] = [];

      for (let start = 0; start < audioBuffer.length; start += chunkSamples) {
        const length = Math.min(chunkSamples, audioBuffer.length - start);
        if (length <= 0) break;
        segments.push(
          audioBufferSliceToWavBlob(audioBuffer, start, length),
        );
      }

      return segments.length > 0 ? segments : [blob];
    } finally {
      void audioContext.close();
    }
  } catch {
    return [blob];
  }
}
