import { runJob, type JobOptions } from "./worker-client";

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
  eq31: number; // 31 Hz  — Sub-bass
  eq63: number; // 63 Hz  — Bass
  eq125: number; // 125 Hz — Upper bass
  eq250: number; // 250 Hz — Low mids
  eq500: number; // 500 Hz — Mids
  eq1k: number; // 1 kHz  — Central mid band
  eq2k: number; // 2 kHz  — Upper mids
  eq4k: number; // 4 kHz  — Presence
  eq8k: number; // 8 kHz  — Brilliance
  eq16k: number; // 16 kHz — Air
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
  /** Final volume as a multiplier: 1 = 100% (unchanged), 0.1 – 2. */
  volume: number;
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
  harmonizerInterval: 1,
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
  compressor: 0.45,
  saturation: 0.02,
  reverb: 0,
  reverbSize: 1.8,
  delay: 0,
  delayTime: 0.15,
  delayFeedback: 0.3,
  chorus: 0,
  volume: 1,
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

/**
 * Loop gain of the echo for a 0..1 feedback setting. The whole knob range maps
 * onto 0..0.85 so the top of the knob is never a dead zone and the loop can
 * never run away.
 */
function feedbackGain(setting: number): number {
  return 0.85 * Math.min(1, Math.max(0, setting));
}

/** How long reverb / echo keep ringing after the dry signal ends. */
export function tailSeconds(s: Settings): number {
  const fb = feedbackGain(s.delayFeedback);
  const repeats = fb > 0 ? Math.ceil(Math.log(0.001) / Math.log(fb)) : 1;
  const delayTail = s.delay > 0 ? s.delayTime * repeats : 0;
  return Math.min(60, Math.max(s.reverb > 0 ? s.reverbSize : 0, delayTail));
}

const CLEANUP_KEYS: ReadonlySet<string> = new Set(["denoise", "hiss", "breath", "deEss"]);

/** Identifies the settings that shape the augmented result (everything except cleanup). */
export function augmentationKey(s: Settings): string {
  return JSON.stringify(Object.entries(s).filter(([k]) => !CLEANUP_KEYS.has(k)));
}

function toAudioBuffer(channels: Float32Array<ArrayBuffer>[], sampleRate: number): AudioBuffer {
  const buffer = new AudioBuffer({
    numberOfChannels: channels.length,
    length: Math.max(1, channels[0]?.length ?? 1),
    sampleRate,
  });
  channels.forEach((data, c) => buffer.copyToChannel(data, c));
  return buffer;
}

const channelCopies = (buffer: AudioBuffer) =>
  Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c).slice());

/** Noise / hiss / breath / sibilance cleanup, run in a worker. */
export async function renderCleaned(
  source: AudioBuffer,
  s: Settings,
  opts: JobOptions = {},
): Promise<AudioBuffer> {
  const { channels } = await runJob(
    {
      type: "clean",
      channels: channelCopies(source),
      sampleRate: source.sampleRate,
      denoise: s.denoise,
      hiss: s.hiss,
      breath: s.breath,
      deEss: s.deEss,
    },
    opts,
  );
  return toAudioBuffer(channels, source.sampleRate);
}

/** Duration-preserving pitch shift, run in a worker. */
export async function pitchBuffer(
  source: AudioBuffer,
  semitones: number,
  opts: JobOptions = {},
): Promise<AudioBuffer> {
  const { channels } = await runJob(
    { type: "pitch", channels: channelCopies(source), sampleRate: source.sampleRate, semitones },
    opts,
  );
  return toAudioBuffer(channels, source.sampleRate);
}

/** Speed change that keeps pitch (2 = twice as fast), run in a worker. */
export async function speedBuffer(
  source: AudioBuffer,
  speed: number,
  opts: JobOptions = {},
): Promise<AudioBuffer> {
  const { channels } = await runJob(
    { type: "speed", channels: channelCopies(source), sampleRate: source.sampleRate, speed },
    opts,
  );
  return toAudioBuffer(channels, source.sampleRate);
}

/** What the rack plays: the (pitch-shifted) voice plus an optional harmony copy. */
export type RackAudio = { main: AudioBuffer; harmony: AudioBuffer | null };

/** The settings that decide which pitch-shifted buffers are needed. */
export type VoiceSettings = Pick<Settings, "pitch" | "harmonizer" | "harmonizerInterval">;

type PitchSlot = { source: AudioBuffer; semitones: number; out: AudioBuffer };

/**
 * Remembers the last pitch-shifted buffer per voice so that live preview,
 * rendering and export don't redo the same shift.
 */
export class PitchCache {
  private slots = new Map<string, PitchSlot>();

  private hit(slot: string, source: AudioBuffer, semitones: number): AudioBuffer | null {
    if (Math.abs(semitones) < 0.01) return source;
    const entry = this.slots.get(slot);
    return entry && entry.source === source && entry.semitones === semitones ? entry.out : null;
  }

  private async shift(slot: string, source: AudioBuffer, semitones: number, opts: JobOptions) {
    const cached = this.hit(slot, source, semitones);
    if (cached) return cached;
    const out = await pitchBuffer(source, semitones, opts);
    this.slots.set(slot, { source, semitones, out });
    return out;
  }

  /** The audio for these settings if no shifting is needed (or it is already cached). */
  peek(source: AudioBuffer, s: VoiceSettings): RackAudio | null {
    const main = this.hit("main", source, s.pitch);
    if (!main) return null;
    if (s.harmonizer <= 0) return { main, harmony: null };
    const harmony = this.hit("harmony", source, s.pitch + s.harmonizerInterval);
    return harmony ? { main, harmony } : null;
  }

  async prepare(source: AudioBuffer, s: VoiceSettings, opts: JobOptions = {}): Promise<RackAudio> {
    const harmonise = s.harmonizer > 0;
    const split = harmonise && Math.abs(s.pitch) >= 0.01 ? 0.5 : 1;
    const main = await this.shift("main", source, s.pitch, {
      signal: opts.signal,
      onProgress: (f) => opts.onProgress?.(f * split),
    });
    // The harmony is shifted straight from the source (not from the already
    // shifted voice) so it only goes through the shifter once.
    const harmony = harmonise
      ? await this.shift("harmony", source, s.pitch + s.harmonizerInterval, {
          signal: opts.signal,
          onProgress: (f) => opts.onProgress?.(1 - split + f * split),
        })
      : null;
    return { main, harmony };
  }

  clear() {
    this.slots.clear();
  }
}

/** The augmentation effects as a Web Audio graph. */
export type Rack = {
  /** Feed the (pitch-shifted) voice here. */
  input: AudioNode;
  /** Feed the harmony copy here; it is mixed in after the dynamics stage. */
  harmonyInput: AudioNode;
  output: AudioNode;
  /** Glide every parameter to new settings. Only racks built with `live` follow all of them. */
  update(s: Settings): void;
};

/**
 * Build the effects rack on any audio context.
 *
 * `live` racks contain every effect, parked at a neutral setting when it is
 * off, so `update` can follow the controls in real time without rewiring.
 * Offline racks leave unused effects out entirely, which renders faster.
 */
export function buildRack(ctx: BaseAudioContext, initial: Settings, live: boolean): Rack {
  const wants = (amount: number) => live || amount > 0;

  const input = ctx.createGain();
  let node: AudioNode = input;
  const chain = <T extends AudioNode>(n: T): T => {
    node.connect(n);
    node = n;
    return n;
  };

  // 10-band graphic equalizer
  const eq = EQ_BANDS.map((band) => {
    if (!live && initial[band.key] === 0) return null;
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
    return chain(f);
  });

  // Saturation
  let shaper: WaveShaperNode | null = null;
  let trim: GainNode | null = null;
  if (wants(initial.saturation)) {
    shaper = chain(ctx.createWaveShaper());
    shaper.oversample = "4x";
    trim = chain(ctx.createGain());
  }

  // Compressor
  let comp: DynamicsCompressorNode | null = null;
  let makeup: GainNode | null = null;
  if (wants(initial.compressor)) {
    comp = chain(ctx.createDynamicsCompressor());
    comp.knee.value = 12;
    comp.attack.value = 0.005;
    comp.release.value = 0.15;
    makeup = chain(ctx.createGain());
  }

  const preFx = chain(ctx.createGain());
  const mix = ctx.createGain();
  preFx.connect(mix);

  // Harmonizer: pitch-shifted copy blended in
  const harmonyInput = ctx.createGain();
  harmonyInput.connect(mix);

  // Chorus
  let chorusDepth: GainNode | null = null;
  let chorusGain: GainNode | null = null;
  if (wants(initial.chorus)) {
    const d = ctx.createDelay(0.05);
    d.delayTime.value = 0.022;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.6;
    chorusDepth = ctx.createGain();
    lfo.connect(chorusDepth).connect(d.delayTime);
    lfo.start();
    chorusGain = ctx.createGain();
    preFx.connect(d).connect(chorusGain).connect(mix);
  }

  // Delay / echo with feedback
  let delay: DelayNode | null = null;
  let feedback: GainNode | null = null;
  let delayGain: GainNode | null = null;
  if (wants(initial.delay)) {
    delay = ctx.createDelay(2);
    feedback = ctx.createGain();
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 4000;
    // The default Q gives the filter a resonant bump above unity gain, which
    // makes the loop grow instead of decay at high feedback. -3 dB is flat.
    damp.Q.value = -3.01;
    delayGain = ctx.createGain();
    preFx.connect(delay);
    delay.connect(damp).connect(feedback).connect(delay);
    delay.connect(delayGain).connect(mix);
  }

  // Reverb. The impulse can't be resized in place, so a size change swaps in
  // a fresh convolver.
  const reverbGain = wants(initial.reverb) ? ctx.createGain() : null;
  reverbGain?.connect(mix);
  let convolver: ConvolverNode | null = null;
  let impulseSize = -1;
  let impulseTimer: ReturnType<typeof setTimeout> | undefined;
  const setImpulse = (size: number) => {
    if (!reverbGain || size === impulseSize) return;
    impulseSize = size;
    const next = ctx.createConvolver();
    next.buffer = makeImpulse(ctx, size);
    preFx.connect(next);
    next.connect(reverbGain);
    if (convolver) {
      preFx.disconnect(convolver);
      convolver.disconnect();
    }
    convolver = next;
  };

  const output = ctx.createGain();
  mix.connect(output);

  let saturation = -1;
  const apply = (s: Settings, immediate: boolean) => {
    const set = (param: AudioParam, value: number) => {
      if (immediate) param.value = value;
      else param.setTargetAtTime(value, ctx.currentTime, 0.02);
    };

    eq.forEach((f, i) => f && set(f.gain, s[EQ_BANDS[i]!.key]));

    if (shaper && trim) {
      if (s.saturation !== saturation) {
        saturation = s.saturation;
        shaper.curve = null; // a set curve must be cleared before it can be replaced
        if (s.saturation > 0) shaper.curve = saturationCurve(s.saturation);
      }
      set(trim.gain, 1 - 0.3 * s.saturation);
    }

    if (comp && makeup) {
      // Ratio 1 with a 0 dB threshold is the compressor's bypass.
      set(comp.threshold, s.compressor > 0 ? -6 - 30 * s.compressor : 0);
      set(comp.ratio, s.compressor > 0 ? 1.5 + 10 * s.compressor : 1);
      set(makeup.gain, 1 + s.compressor * 0.8);
    }

    set(harmonyInput.gain, s.harmonizer * 0.8);

    if (chorusDepth && chorusGain) {
      set(chorusDepth.gain, 0.004 * s.chorus);
      set(chorusGain.gain, s.chorus * 0.6);
    }

    if (delay && feedback && delayGain) {
      set(delay.delayTime, s.delayTime);
      set(feedback.gain, feedbackGain(s.delayFeedback));
      set(delayGain.gain, s.delay);
    }

    if (reverbGain) {
      set(reverbGain.gain, s.reverb);
      clearTimeout(impulseTimer);
      // Dragging the size knob would otherwise rebuild the impulse on every tick.
      if (immediate) setImpulse(s.reverbSize);
      else impulseTimer = setTimeout(() => setImpulse(s.reverbSize), 120);
    }

    set(output.gain, s.volume);
  };

  apply(initial, true);
  return { input, harmonyInput, output, update: (s) => apply(s, false) };
}

/** Offline (faster than realtime) render of the augmentation rack. */
export async function renderAugmented(audio: RackAudio, s: Settings): Promise<AudioBuffer> {
  const { main, harmony } = audio;
  const sr = main.sampleRate;
  const length = main.length + Math.ceil(tailSeconds(s) * sr);
  const ctx = new OfflineAudioContext(main.numberOfChannels, length, sr);
  const rack = buildRack(ctx, s, false);

  const src = ctx.createBufferSource();
  src.buffer = main;
  src.connect(rack.input);
  src.start();

  if (harmony && s.harmonizer > 0) {
    const hSrc = ctx.createBufferSource();
    hSrc.buffer = harmony;
    hSrc.connect(rack.harmonyInput);
    hSrc.start();
  }

  rack.output.connect(ctx.destination);
  return ctx.startRendering();
}
