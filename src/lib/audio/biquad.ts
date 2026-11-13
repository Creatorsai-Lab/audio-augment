// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck -- tight numeric DSP loops; indexes are bounds-checked by construction.
// Plain-JS biquad filters (RBJ cookbook) for code that runs outside Web Audio.

type Coeffs = { b0: number; b1: number; b2: number; a1: number; a2: number };

function run(data: Float32Array, c: Coeffs) {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i];
    const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    data[i] = y;
  }
}

/** In-place peaking EQ. No-op when the centre frequency is above Nyquist. */
export function peakingFilter(
  data: Float32Array,
  sampleRate: number,
  freq: number,
  q: number,
  gainDb: number,
) {
  if (freq >= sampleRate / 2 || gainDb === 0) return;
  const a = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);
  const a0 = 1 + alpha / a;
  run(data, {
    b0: (1 + alpha * a) / a0,
    b1: (-2 * cos) / a0,
    b2: (1 - alpha * a) / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha / a) / a0,
  });
}

/** In-place 4th-order Butterworth low-pass. No-op when the cutoff is above Nyquist. */
export function lowpassFilter(data: Float32Array, sampleRate: number, freq: number) {
  if (freq >= sampleRate / 2) return;
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const cos = Math.cos(w0);
  for (const q of [0.5412, 1.3066]) {
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    run(data, {
      b0: (1 - cos) / 2 / a0,
      b1: (1 - cos) / a0,
      b2: (1 - cos) / 2 / a0,
      a1: (-2 * cos) / a0,
      a2: (1 - alpha) / a0,
    });
  }
}
