// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck -- tight numeric DSP loops; indexes are bounds-checked by construction.
import { fft } from "./fft";

const N = 1024;
const HOP = 256;

function hann(n: number) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

export type DenoiseOptions = {
  /** 0..1 how aggressively the noise floor is subtracted */
  amount: number;
  /** 0..1 extra attenuation of hiss (high bins) */
  hiss: number;
  /** 0..1 gate strength on low-energy frames (breaths, room tone) */
  breath: number;
};

/**
 * STFT spectral gating: estimate a per-bin noise floor from the quietest
 * frames, then subtract it with smoothed spectral gain. Pure DSP, no ML models.
 */
export function denoiseChannel(
  input: Float32Array,
  sampleRate: number,
  opts: DenoiseOptions,
): Float32Array<ArrayBuffer> {
  const win = hann(N);
  const frames = Math.max(1, Math.ceil((input.length + N) / HOP));
  const half = N / 2 + 1;
  const mags: Float32Array[] = [];
  const phases: Float32Array[] = [];
  const energies: number[] = [];

  const re = new Float32Array(N);
  const im = new Float32Array(N);

  for (let f = 0; f < frames; f++) {
    const start = f * HOP - N / 2;
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < N; i++) {
      const idx = start + i;
      re[i] = idx >= 0 && idx < input.length ? input[idx] * win[i] : 0;
    }
    fft(re, im);
    const m = new Float32Array(half);
    const p = new Float32Array(half);
    let e = 0;
    for (let k = 0; k < half; k++) {
      m[k] = Math.hypot(re[k], im[k]);
      p[k] = Math.atan2(im[k], re[k]);
      e += m[k] * m[k];
    }
    mags.push(m);
    phases.push(p);
    energies.push(e);
  }

  // Noise floor per bin = low percentile across frames.
  const noise = new Float32Array(half);
  const scratch = new Float32Array(frames);
  for (let k = 0; k < half; k++) {
    for (let f = 0; f < frames; f++) scratch[f] = mags[f][k];
    const sorted = Float32Array.from(scratch).sort();
    noise[k] = sorted[Math.floor(frames * 0.15)];
  }

  const sortedE = [...energies].sort((a, b) => a - b);
  const quiet = sortedE[Math.floor(frames * 0.35)] || 0;
  const loud = sortedE[Math.floor(frames * 0.9)] || 1;

  const over = 1 + 2.5 * opts.amount; // oversubtraction factor
  const floorGain = 0.08 * (1 - opts.amount) + 0.02;
  const hissBin = Math.floor((4000 / (sampleRate / 2)) * half);

  const out = new Float32Array(input.length);
  const norm = new Float32Array(input.length);
  const prevGain = new Float32Array(half).fill(1);

  for (let f = 0; f < frames; f++) {
    const m = mags[f];
    const p = phases[f];
    // frame-level gate for breaths / room tone
    const level = (energies[f] - quiet) / (loud - quiet + 1e-9);
    const frameGain =
      opts.breath > 0
        ? Math.min(1, Math.max(floorGain, 0.25 + level * 1.6)) ** (opts.breath * 2)
        : 1;

    re.fill(0);
    im.fill(0);
    for (let k = 0; k < half; k++) {
      const clean = Math.max(0, m[k] - over * noise[k]);
      let g = m[k] > 1e-9 ? clean / m[k] : 0;
      g = Math.max(g, floorGain);
      if (k >= hissBin && m[k] < noise[k] * (2 + 6 * opts.hiss)) g *= 1 - 0.9 * opts.hiss;
      g = 0.6 * g + 0.4 * prevGain[k]; // temporal smoothing avoids musical noise
      prevGain[k] = g;
      const mag = m[k] * g * frameGain;
      re[k] = mag * Math.cos(p[k]);
      im[k] = mag * Math.sin(p[k]);
      if (k > 0 && k < N / 2) {
        re[N - k] = re[k];
        im[N - k] = -im[k];
      }
    }
    fft(re, im, true);

    const start = f * HOP - N / 2;
    for (let i = 0; i < N; i++) {
      const idx = start + i;
      if (idx < 0 || idx >= out.length) continue;
      out[idx] += re[i] * win[i];
      norm[idx] += win[i] * win[i];
    }
  }

  for (let i = 0; i < out.length; i++) out[i] = norm[i] > 1e-6 ? out[i] / norm[i] : out[i];
  return out;
}
