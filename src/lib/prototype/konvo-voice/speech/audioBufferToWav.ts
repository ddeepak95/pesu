/** Build a mono 16-bit WAV ArrayBuffer from PCM s16le bytes. */
export function pcmToWavArrayBuffer(
  pcm: Uint8Array,
  sampleRate: number,
): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const dataSize = pcm.byteLength;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i)!);
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  new Uint8Array(buffer).set(pcm, 44);
  return buffer;
}

export function audioBufferSliceToWavBlob(
  buffer: AudioBuffer,
  startSample: number,
  lengthSamples: number,
): Blob {
  const channel = buffer.getChannelData(0);
  const samples = Math.min(lengthSamples, buffer.length - startSample);
  const pcm = new Int16Array(samples);
  for (let i = 0; i < samples; i++) {
    const s = Math.max(-1, Math.min(1, channel[startSample + i]!));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const wav = pcmToWavArrayBuffer(new Uint8Array(pcm.buffer), buffer.sampleRate);
  return new Blob([wav], { type: "audio/wav" });
}
