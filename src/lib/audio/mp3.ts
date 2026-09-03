import lamejs from "lamejs";

export function encodeMp3(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, buffer.numberOfChannels);
  const encoder = new lamejs.Mp3Encoder(channels, buffer.sampleRate, 192);
  const samples = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  const chunkSize = 1152;
  const chunks: Uint8Array<ArrayBuffer>[] = [];

  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    const left = toPcm16(samples[0]!.subarray(offset, offset + chunkSize));
    const right =
      channels === 2 ? toPcm16(samples[1]!.subarray(offset, offset + chunkSize)) : undefined;
    const encoded = encoder.encodeBuffer(left, right);
    if (encoded.length > 0) chunks.push(new Uint8Array(encoded));
  }

  const finalChunk = encoder.flush();
  if (finalChunk.length > 0) chunks.push(new Uint8Array(finalChunk));
  return new Blob(chunks, { type: "audio/mpeg" });
}

function toPcm16(samples: Float32Array): Int16Array {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]!));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm;
}
