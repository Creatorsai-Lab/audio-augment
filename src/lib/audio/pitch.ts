// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck -- tight numeric DSP loops; indexes are bounds-checked by construction.
/** Granular (overlap-add) pitch shifter — keeps duration, shifts pitch. */
export function pitchShiftChannel(
  input: Float32Array<ArrayBuffer>,
  semitones: number,
): Float32Array<ArrayBuffer> {
  if (Math.abs(semitones) < 0.01) return input;
  const ratio = Math.pow(2, semitones / 12);
  const grain = 2048;
  const hop = grain / 4;
  const out = new Float32Array(input.length);
  const norm = new Float32Array(input.length);
  const win = new Float32Array(grain);
  for (let i = 0; i < grain; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / grain);

  for (let start = 0; start < input.length; start += hop) {
    for (let i = 0; i < grain; i++) {
      const src = start + i * ratio;
      const i0 = Math.floor(src);
      const frac = src - i0;
      if (i0 < 0 || i0 + 1 >= input.length) continue;
      const s = input[i0]! * (1 - frac) + input[i0 + 1]! * frac;
      const idx = start + i;
      if (idx >= out.length) break;
      out[idx] += s * win[i];
      norm[idx] += win[i];
    }
  }
  for (let i = 0; i < out.length; i++) if (norm[i]! > 1e-6) out[i]! /= norm[i]!;
  return out;
}
