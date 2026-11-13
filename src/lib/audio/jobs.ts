// The CPU-heavy audio jobs. Pure functions over typed arrays (no DOM, no Web
// Audio) so they can run inside a Web Worker — see audio.worker.ts.
import lameSource from "lamejs/lame.min.js?raw";
import { peakingFilter } from "./biquad";
import { denoiseChannel } from "./denoise";
import { pitchShiftChannels } from "./pitch";

export type CleanJob = {
  type: "clean";
  channels: Float32Array[];
  sampleRate: number;
  denoise: number;
  hiss: number;
  breath: number;
  deEss: number;
};

export type PitchJob = {
  type: "pitch";
  channels: Float32Array[];
  sampleRate: number;
  semitones: number;
};

export type Mp3Job = {
  type: "mp3";
  channels: Float32Array[];
  sampleRate: number;
  kbps: number;
};

export type Job = CleanJob | PitchJob | Mp3Job;

export type JobResult<J extends Job> = J extends Mp3Job
  ? { chunks: Uint8Array<ArrayBuffer>[] }
  : { channels: Float32Array<ArrayBuffer>[] };

type Progress = (fraction: number) => void;

type LameEncoder = {
  encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
  flush(): Int8Array;
};
type Lame = { Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => LameEncoder };

let lame: Lame | null = null;
function loadLame(): Lame {
  // lame.min.js is a classic script that defines a global `lamejs`; its ES
  // module build is broken under bundlers, so evaluate the script text instead.
  lame ??= new Function(`${lameSource}\nreturn lamejs;`)() as Lame;
  return lame;
}

function clean(job: CleanJob, onProgress: Progress) {
  const denoising = job.denoise > 0 || job.hiss > 0 || job.breath > 0;
  const channels = job.channels.map((data, c) => {
    const base = c / job.channels.length;
    const out = denoising
      ? denoiseChannel(
          data,
          job.sampleRate,
          { amount: job.denoise, hiss: job.hiss, breath: job.breath },
          (f) => onProgress(base + f / job.channels.length),
        )
      : new Float32Array(data);
    // De-esser: narrow dip around sibilance.
    if (job.deEss > 0) peakingFilter(out, job.sampleRate, 6800, 2.2, -14 * job.deEss);
    return out;
  });
  return { channels };
}

function pitch(job: PitchJob, onProgress: Progress) {
  const channels = pitchShiftChannels(job.channels, job.semitones, job.sampleRate, onProgress);
  return { channels: channels as Float32Array<ArrayBuffer>[] };
}

function toPcm16(samples: Float32Array): Int16Array {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]!));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm;
}

function mp3(job: Mp3Job, onProgress: Progress) {
  const count = Math.min(2, job.channels.length);
  const left = job.channels[0]!;
  const right = count === 2 ? job.channels[1]! : undefined;
  const encoder = new (loadLame().Mp3Encoder)(count, job.sampleRate, job.kbps);
  const block = 1152 * 32;
  const chunks: Uint8Array<ArrayBuffer>[] = [];

  for (let offset = 0; offset < left.length; offset += block) {
    const encoded = encoder.encodeBuffer(
      toPcm16(left.subarray(offset, offset + block)),
      right && toPcm16(right.subarray(offset, offset + block)),
    );
    if (encoded.length > 0) chunks.push(new Uint8Array(encoded));
    onProgress(offset / left.length);
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(new Uint8Array(tail));
  return { chunks };
}

export function executeJob<J extends Job>(job: J, onProgress: Progress): JobResult<J> {
  const result =
    job.type === "clean"
      ? clean(job, onProgress)
      : job.type === "pitch"
        ? pitch(job, onProgress)
        : mp3(job, onProgress);
  return result as JobResult<J>;
}

/** The buffers of a result, for zero-copy transfer back from the worker. */
export function transferables(result: JobResult<Job>): ArrayBuffer[] {
  const arrays = "chunks" in result ? result.chunks : result.channels;
  return arrays.map((a) => a.buffer);
}
