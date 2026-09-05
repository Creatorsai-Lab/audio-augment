import { denoiseChannel } from "./denoise";
import { pitchShiftChannel } from "./pitch";

export type Settings = {
  // cleanup
  denoise: number;
  hiss: number;
  breath: number;
  deEss: number;
  // voice
  pitch: number;
  harmonizer: number;
  harmonizerInterval: number;
  // 10-band graphic EQ (dB gain per band)
  eq31: number;   // 31 Hz  — Sub-bass
  eq63: number;   // 63 Hz  — Bass
  eq125: number;  // 125 Hz — Upper bass
  eq250: number;  // 250 Hz — Low mids
  eq500: number;  // 500 Hz — Mids
  eq1k: number;   // 1 kHz  — Central mid band
  eq2k: number;   // 2 kHz  — Upper mids
  eq4k: number;   // 4 kHz  — Presence
  eq8k: number;   // 8 kHz  — Brilliance
  eq16k: number;  // 16 kHz — Air
  // dynamics / colour
  compressor: number;
  saturation: number;
  // space
  reverb: number;
  reverbSize: number;
  delay: number;
  delayTime: number;
  delayFeedback: number;
  chorus: number;
  output: number;
};

/** Standard 10-band graphic EQ frequencies and their descriptions. */
export const EQ_BANDS = [
  { key: "eq31" as const, freq: 31, label: "31 : Sub-bass" },
  { key: "eq63" as const, freq: 63, label: "63 : Bass" },
  { key: "eq125" as const, freq: 125, label: "125 : Upper bass" },
  { key: "eq250" as const, freq: 250, label: "250 : Low mids" },
  { key: "eq500" as const, freq: 500, label: "500 : Mids" },
  { key: "eq1k" as const, freq: 1000, label: "1K : C mid band" },
  { key: "eq2k" as const, freq: 2000, label: "2K : Upper mids" },
  { key: "eq4k" as const, freq: 4000, label: "4K : Presence" },
  { key: "eq8k" as const, freq: 8000, label: "8K : Brilliance" },
  { key: "eq16k" as const, freq: 16000, label: "16K : Air" },
] as const;

export const defaultSettings: Settings = {
  denoise: 0.6,
  hiss: 0.5,
  breath: 0.35,
  deEss: 0.3,
  pitch: 0,
  harmonizer: 0,
  harmonizerInterval: 7,
  eq31: 0,
  eq63: 0,
  eq125: 0,
  eq250: 0,
  eq500: 0,
  eq1k: 0,
  eq2k: 0,
  eq4k: 0,
  eq8k: 0,
  eq16k: 0,
  compressor: 0.35,
  saturation: 0,
  reverb: 0,
  reverbSize: 1.8,
  delay: 0,
  delayTime: 0.25,
  delayFeedback: 0.3,
  chorus: 0,
  output: 0,
};

function makeImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
  }
  return buf;
}

function saturationCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = amount * 40;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

/** Offline (faster than realtime) render of the whole chain. */
export async function renderCleaned(
  source: AudioBuffer,
  s: Settings,
  onStage?: (label: string) => void,
): Promise<AudioBuffer> {
  const sr = source.sampleRate;
  const ch = source.numberOfChannels;

  onStage?.("Analysing noise profile");
  const ctx = new OfflineAudioContext(ch, source.length, sr);
  const cleaned = ctx.createBuffer(ch, source.length, sr);
  for (let c = 0; c < ch; c++) {
    let data = source.getChannelData(c);
    if (s.denoise > 0 || s.hiss > 0 || s.breath > 0) {
      data = denoiseChannel(new Float32Array(data), sr, {
        amount: s.denoise,
        hiss: s.hiss,
        breath: s.breath,
      });
    }
    cleaned.copyToChannel(data, c);
  }
  onStage?.("Done");
  return cleaned;
}

/** Offline render of the augmentation rack, starting with an already-cleaned buffer. */
export async function renderAugmented(
  source: AudioBuffer,
  s: Settings,
  onStage?: (label: string) => void,
): Promise<AudioBuffer> {
  const sr = source.sampleRate;
  const ch = source.numberOfChannels;

  onStage?.("Preparing augmentation");
  const cleaned: Float32Array<ArrayBuffer>[] = [];
  for (let c = 0; c < ch; c++) {
    let data = new Float32Array(source.getChannelData(c));
    if (s.pitch !== 0) data = pitchShiftChannel(data, s.pitch);
    cleaned.push(data);
  }

  onStage?.("Applying effects");
  const delayTail =
    s.delay > 0
      ? s.delayTime *
      (s.delayFeedback > 0 ? Math.ceil(Math.log(0.001) / Math.log(s.delayFeedback)) : 1)
      : 0;
  const tailSeconds = Math.min(60, Math.max(s.reverb > 0 ? s.reverbSize : 0, delayTail));
  const renderLength = source.length + Math.ceil(tailSeconds * sr);
  const ctx = new OfflineAudioContext(ch, renderLength, sr);
  const dry = ctx.createBuffer(ch, source.length, sr);
  for (let c = 0; c < ch; c++) dry.copyToChannel(cleaned[c]!, c);

  const src = ctx.createBufferSource();
  src.buffer = dry;

  let node: AudioNode = src;
  const chain = (n: AudioNode) => {
    node.connect(n);
    node = n;
  };

  // De-esser: narrow dip around sibilance
  if (s.deEss > 0) {
    const de = ctx.createBiquadFilter();
    de.type = "peaking";
    de.frequency.value = 6800;
    de.Q.value = 2.2;
    de.gain.value = -14 * s.deEss;
    chain(de);
  }

  // 10-band graphic equalizer
  for (const band of EQ_BANDS) {
    const gain = s[band.key];
    if (gain === 0) continue; // skip bands at 0 dB for efficiency
    const f = ctx.createBiquadFilter();
    if (band.freq <= 31) {
      f.type = "lowshelf";
    } else if (band.freq >= 16000) {
      f.type = "highshelf";
    } else {
      f.type = "peaking";
      // Q ≈ 1.4 gives ~1-octave bandwidth, good for 10-band graphic EQ
      f.Q.value = 1.4;
    }
    f.frequency.value = band.freq;
    f.gain.value = gain;
    chain(f);
  }

  // Saturation
  if (s.saturation > 0) {
    const shaper = ctx.createWaveShaper();
    shaper.curve = saturationCurve(s.saturation);
    shaper.oversample = "4x";
    chain(shaper);
    const trim = ctx.createGain();
    trim.gain.value = 1 - 0.3 * s.saturation;
    chain(trim);
  }

  // Compressor
  if (s.compressor > 0) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -6 - 30 * s.compressor;
    comp.ratio.value = 1.5 + 10 * s.compressor;
    comp.knee.value = 12;
    comp.attack.value = 0.005;
    comp.release.value = 0.15;
    chain(comp);
    const makeup = ctx.createGain();
    makeup.gain.value = 1 + s.compressor * 0.8;
    chain(makeup);
  }

  const preFx = ctx.createGain();
  chain(preFx);

  const mix = ctx.createGain();
  preFx.connect(mix);

  // Harmonizer: pitch-shifted copy blended in
  if (s.harmonizer > 0) {
    const hBuf = ctx.createBuffer(ch, source.length, sr);
    for (let c = 0; c < ch; c++) {
      hBuf.copyToChannel(pitchShiftChannel(cleaned[c]!, s.harmonizerInterval), c);
    }
    const hSrc = ctx.createBufferSource();
    hSrc.buffer = hBuf;
    const hGain = ctx.createGain();
    hGain.gain.value = s.harmonizer * 0.8;
    hSrc.connect(hGain).connect(mix);
    hSrc.start();
  }

  // Chorus
  if (s.chorus > 0) {
    const d = ctx.createDelay(0.05);
    d.delayTime.value = 0.022;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.6;
    const depth = ctx.createGain();
    depth.gain.value = 0.004 * s.chorus;
    lfo.connect(depth).connect(d.delayTime);
    lfo.start();
    const g = ctx.createGain();
    g.gain.value = s.chorus * 0.6;
    preFx.connect(d).connect(g).connect(mix);
  }

  // Delay / echo with feedback
  if (s.delay > 0) {
    const d = ctx.createDelay(2);
    d.delayTime.value = s.delayTime;
    const fb = ctx.createGain();
    fb.gain.value = Math.min(0.85, s.delayFeedback);
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 4000;
    const g = ctx.createGain();
    g.gain.value = s.delay;
    preFx.connect(d);
    d.connect(damp).connect(fb).connect(d);
    d.connect(g).connect(mix);
  }

  // Reverb
  if (s.reverb > 0) {
    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(ctx, s.reverbSize);
    const g = ctx.createGain();
    g.gain.value = s.reverb;
    preFx.connect(conv).connect(g).connect(mix);
  }

  const out = ctx.createGain();
  out.gain.value = Math.pow(10, s.output / 20);
  mix.connect(out).connect(ctx.destination);
  src.start();

  const rendered = await ctx.startRendering();
  onStage?.("Done");
  return rendered;
}
