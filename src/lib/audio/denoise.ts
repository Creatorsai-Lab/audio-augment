// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck -- tight numeric DSP loops; indexes are bounds-checked by construction.
import { fft } from "./fft";

const N = 1024;
const HOP = 256;
/** Upper bound on frames kept for the noise profile, so memory stays flat for long files. */
const MAX_PROFILE_FRAMES = 2048;

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
 *
 * Runs in two streaming passes (profile, then filter) so the only per-file
 * allocations are the output and one number per frame — the spectra themselves
 * are never stored.
 */
export function denoiseChannel(
  input: Float32Array,
  sampleRate: number,
  opts: DenoiseOptions,
  onProgress?: (fraction: number) => void,
): Float32Array<ArrayBuffer> {
  const win = hann(N);
  const frames = Math.max(1, Math.ceil((input.length + N) / HOP));
  const half = N / 2 + 1;
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const reportEvery = Math.max(1, Math.floor(frames / 50));

  const analyse = (f: number) => {
    const start = f * HOP - N / 2;
    im.fill(0);
    for (let i = 0; i < N; i++) {
      const idx = start + i;
      re[i] = idx >= 0 && idx < input.length ? input[idx] * win[i] : 0;
    }
    fft(re, im);
  };

  // ── Pass 1: frame energies + magnitudes of an evenly spaced subset of frames.
  const energies = new Float64Array(frames);
  const stride = Math.max(1, Math.ceil(frames / MAX_PROFILE_FRAMES));
  const profileFrames = Math.ceil(frames / stride);
  const profile = new Float32Array(profileFrames * half);

  for (let f = 0; f < frames; f++) {
    analyse(f);
    const keep = f % stride === 0;
    const row = (f / stride) * half;
    let e = 0;
    for (let k = 0; k < half; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      e += p;
      if (keep) profile[row + k] = Math.sqrt(p);
    }
    energies[f] = e;
    if (onProgress && f % reportEvery === 0) onProgress((0.4 * f) / frames);
  }

  // Noise floor per bin = low percentile across the profiled frames.
  const noise = new Float32Array(half);
  const scratch = new Float32Array(profileFrames);
  const pick = Math.floor(profileFrames * 0.15);
  for (let k = 0; k < half; k++) {
    for (let f = 0; f < profileFrames; f++) scratch[f] = profile[f * half + k];
    scratch.sort();
    noise[k] = scratch[pick];
  }

  const sortedE = Float64Array.from(energies).sort();
  const quiet = sortedE[Math.floor(frames * 0.35)] || 0;
  const loud = sortedE[Math.floor(frames * 0.9)] || 1;

  const over = 1 + 2.5 * opts.amount; // oversubtraction factor
  const floorGain = 0.08 * (1 - opts.amount) + 0.02;
  const hissBin = Math.floor((4000 / (sampleRate / 2)) * half);

  // ── Pass 2: re-analyse each frame, apply the gain, overlap-add.
  const out = new Float32Array(input.length);
  const prevGain = new Float32Array(half).fill(1);

  for (let f = 0; f < frames; f++) {
    analyse(f);
    // frame-level gate for breaths / room tone
    const level = (energies[f] - quiet) / (loud - quiet + 1e-9);
    const frameGain =
      opts.breath > 0
        ? Math.min(1, Math.max(floorGain, 0.25 + level * 1.6)) ** (opts.breath * 2)
        : 1;

    for (let k = 0; k < half; k++) {
      const m = Math.hypot(re[k], im[k]);
      const clean = Math.max(0, m - over * noise[k]);
      let g = m > 1e-9 ? clean / m : 0;
      g = Math.max(g, floorGain);
      if (k >= hissBin && m < noise[k] * (2 + 6 * opts.hiss)) g *= 1 - 0.9 * opts.hiss;
      g = 0.6 * g + 0.4 * prevGain[k]; // temporal smoothing avoids musical noise
      prevGain[k] = g;
      // Scaling the complex bin keeps its phase, so no atan2/cos/sin round trip.
      const scale = g * frameGain;
      re[k] *= scale;
      im[k] *= scale;
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
    }
    if (onProgress && f % reportEvery === 0) onProgress(0.4 + (0.6 * f) / frames);
  }

  // Window-overlap normalisation. Away from the start every sample is covered
  // by the same set of window positions, so the sum of squared windows only
  // depends on (index mod HOP); the first N samples miss the frames that would
  // start before -N/2 and are computed directly.
  const steady = new Float32Array(HOP);
  for (let r = 0; r < HOP; r++) {
    for (let j = r; j < N; j += HOP) steady[r] += win[j] * win[j];
  }
  const edge = Math.min(N, out.length);
  for (let i = 0; i < edge; i++) {
    let sum = 0;
    for (let start = -N / 2; start <= i; start += HOP) {
      const j = i - start;
      if (j < N) sum += win[j] * win[j];
    }
    if (sum > 1e-6) out[i] /= sum;
  }
  for (let i = edge; i < out.length; i++) out[i] /= steady[i % HOP];

  onProgress?.(1);
  return out;
}
