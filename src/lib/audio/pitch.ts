// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck -- tight numeric DSP loops; indexes are bounds-checked by construction.
import { lowpassFilter } from "./biquad";

/**
 * Pitch shifter that keeps duration: WSOLA time-stretch followed by resampling.
 *
 * WSOLA (waveform-similarity overlap-add) slides each grain a few milliseconds
 * to where it lines up with the waveform already written, so grains join
 * in phase instead of smearing against each other — the warble that plain
 * fixed-position granular shifting produces on voice. All channels share one
 * set of grain positions so stereo images stay intact.
 */
export function pitchShiftChannels(
  channels: Float32Array[],
  semitones: number,
  sampleRate: number,
  onProgress?: (fraction: number) => void,
): Float32Array[] {
  if (Math.abs(semitones) < 0.01 || channels.length === 0) return channels;
  const ratio = Math.pow(2, semitones / 12);
  const length = channels[0].length;

  const window = 2 * Math.round(sampleRate * 0.02); // ~40 ms grain
  const hop = window / 2;
  const tolerance = Math.round(sampleRate * 0.01); // ±10 ms search
  const stretchedLength = Math.ceil(length * ratio);

  const guide = channels.length === 1 ? channels[0] : mixdown(channels);
  const positions = findGrainPositions(
    guide,
    ratio,
    stretchedLength,
    hop,
    tolerance,
    sampleRate,
    onProgress ? (f) => onProgress(f * 0.8) : undefined,
  );

  const win = new Float32Array(window);
  for (let i = 0; i < window; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / window);

  return channels.map((input, c) => {
    // Overlap-add the grains: `input` played `ratio` times longer at the same pitch.
    const stretched = new Float32Array(stretchedLength + window);
    for (let k = 0; k < positions.length; k++) {
      const pos = positions[k];
      const base = k * hop;
      for (let i = 0; i < window; i++) {
        const idx = pos + i;
        if (idx < 0) continue;
        if (idx >= length) break;
        // The first grain has nothing to cross-fade from, so its attack stays flat.
        stretched[base + i] += input[idx] * (k === 0 && i < hop ? 1 : win[i]);
      }
    }

    // Reading faster than 1x folds everything above the new Nyquist back down.
    if (ratio > 1) lowpassFilter(stretched, sampleRate, (0.45 * sampleRate) / ratio);

    // Resample back to the original length (Catmull-Rom), which moves the pitch.
    const out = new Float32Array(length);
    const last = stretched.length - 1;
    for (let i = 0; i < length; i++) {
      const src = i * ratio;
      const i1 = Math.floor(src);
      const t = src - i1;
      const p0 = stretched[i1 > 0 ? i1 - 1 : 0];
      const p1 = stretched[i1];
      const p2 = stretched[i1 + 1 <= last ? i1 + 1 : last];
      const p3 = stretched[i1 + 2 <= last ? i1 + 2 : last];
      out[i] =
        p1 +
        0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
    }
    onProgress?.(0.8 + (0.2 * (c + 1)) / channels.length);
    return out;
  });
}

function mixdown(channels: Float32Array[]): Float32Array {
  const out = new Float32Array(channels[0].length);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[i];
  return out;
}

/** For each output grain, the input offset whose waveform best continues the previous grain. */
function findGrainPositions(
  x: Float32Array,
  ratio: number,
  stretchedLength: number,
  hop: number,
  tolerance: number,
  sampleRate: number,
  onProgress?: (fraction: number) => void,
): Int32Array {
  const count = Math.max(1, Math.ceil(stretchedLength / hop));
  const positions = new Int32Array(count);
  const maxPos = x.length - hop;
  const coarse = Math.max(1, Math.round(sampleRate / 12000));

  // Normalised cross-correlation between the natural continuation and a candidate.
  const score = (natural: number, candidate: number, step: number) => {
    let dot = 0;
    let energy = 0;
    for (let i = 0; i < hop; i += step) {
      const c = x[candidate + i];
      dot += x[natural + i] * c;
      energy += c * c;
    }
    return dot / Math.sqrt(energy + 1e-12);
  };

  let prev = 0;
  for (let k = 1; k < count; k++) {
    const target = Math.round((k * hop) / ratio);
    const natural = prev + hop; // where the previous grain would carry on
    let best = Math.min(Math.max(target, 0), Math.max(0, maxPos));

    if (natural >= 0 && natural <= maxPos && maxPos > 0) {
      const lo = Math.max(0, target - tolerance);
      const hi = Math.min(maxPos, target + tolerance);
      if (natural >= lo && natural <= hi) {
        // Carrying straight on is in range and is a perfect match by definition.
        best = natural;
      } else if (lo <= hi) {
        let bestScore = -Infinity;
        for (let cand = lo; cand <= hi; cand += coarse) {
          const s = score(natural, cand, coarse);
          if (s > bestScore) {
            bestScore = s;
            best = cand;
          }
        }
        if (coarse > 1) {
          const centre = best;
          bestScore = -Infinity;
          const from = Math.max(lo, centre - coarse + 1);
          const to = Math.min(hi, centre + coarse - 1);
          for (let cand = from; cand <= to; cand++) {
            const s = score(natural, cand, 2);
            if (s > bestScore) {
              bestScore = s;
              best = cand;
            }
          }
        }
      }
    }

    positions[k] = best;
    prev = best;
    if (onProgress && k % 64 === 0) onProgress(k / count);
  }
  return positions;
}
