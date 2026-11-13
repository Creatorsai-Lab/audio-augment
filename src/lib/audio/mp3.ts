import { runJob, type JobOptions } from "./worker-client";

/** Encode a buffer to a 192 kbps MP3 in a worker. */
export async function encodeMp3(buffer: AudioBuffer, opts: JobOptions = {}): Promise<Blob> {
  const count = Math.min(2, buffer.numberOfChannels);
  const channels = Array.from({ length: count }, (_, c) => buffer.getChannelData(c).slice());
  const { chunks } = await runJob(
    { type: "mp3", channels, sampleRate: buffer.sampleRate, kbps: 192 },
    opts,
  );
  return new Blob(chunks, { type: "audio/mpeg" });
}
