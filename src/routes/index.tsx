import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Panel } from "../components/Panel";
import { Knob } from "../components/Knob";
import {
  defaultSettings,
  renderAugmented,
  renderCleaned,
  type Settings,
} from "../lib/audio/process";
import { encodeMp3 } from "../lib/audio/mp3";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Audio Augment — Offline Voice Cleanup & Audio Studio" },
      {
        name: "description",
        content:
          "Drop an MP3 or WAV to strip background noise, hiss and breaths, then shape the voice with EQ, pitch, compressor, harmonizer, saturation, reverb, delay and chorus.",
      },
      { property: "og:title", content: "Audio Augment — Offline Voice Cleanup & Audio Studio" },
      {
        property: "og:description",
        content:
          "Signal-processing noise removal plus a full voice effects rack, running entirely in your browser.",
      },
    ],
  }),
  component: Studio,
});

/* ── Presets (augmentation-only, no noise keys) ── */
const PRESETS: Record<string, Partial<Settings>> = {
  Podcast: { compressor: 0.5, eqLow: 2, eqHigh: 3, deEss: 0.4 },
  Radio: { compressor: 0.75, saturation: 0.4, eqLow: 4, eqMid: -2, eqHigh: 4 },
  Cinematic: { reverb: 0.28, reverbSize: 3.2, eqLow: 3, pitch: -2, saturation: 0.2 },
  Robot: { pitch: -5, harmonizer: 0.5, harmonizerInterval: 12, resonance: 0.6, chorus: 0.5 },
};

/* ── Waveform renderer ── */
function drawWave(canvas: HTMLCanvasElement | null, buffer: AudioBuffer | null, color: string) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = (canvas.width = canvas.clientWidth * 2);
  const h = (canvas.height = canvas.clientHeight * 2);
  ctx.clearRect(0, 0, w, h);
  if (!buffer) return;
  const data = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / w));
  ctx.fillStyle = color;
  for (let x = 0; x < w; x++) {
    let min = 1;
    let max = -1;
    for (let i = 0; i < step; i++) {
      const v = data[x * step + i] ?? 0;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    ctx.fillRect(x, ((1 + min) * h) / 2, 1, Math.max(2, ((max - min) * h) / 2));
  }
}

/* ══════════════════════════════════════════════════════════════════════ */

export function Studio() {
  /* ── State ── */
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [fileName, setFileName] = useState<string | null>(null);
  const [original, setOriginal] = useState<AudioBuffer | null>(null);
  const [cleaned, setCleaned] = useState<AudioBuffer | null>(null);
  const [augmented, setAugmented] = useState<AudioBuffer | null>(null);
  const [selectedSource, setSelectedSource] = useState<"original" | "cleaned">("cleaned");

  const [noiseStatus, setNoiseStatus] = useState<string>("");
  const [augStatus, setAugStatus] = useState<string>("");
  const [noiseBusy, setNoiseBusy] = useState(false);
  const [augBusy, setAugBusy] = useState(false);
  const [playing, setPlaying] = useState<"none" | "original" | "cleaned" | "augmented">("none");

  /* ── Refs ── */
  const inRef = useRef<HTMLCanvasElement>(null);
  const outRef = useRef<HTMLCanvasElement>(null);
  const augCanvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<{ ctx: AudioContext; node: AudioBufferSourceNode } | null>(null);
  const operationRef = useRef(0);

  /* ── Settings helper ── */
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setSettings((s) => ({ ...s, [k]: v }));

  /* ── Waveform draws ── */
  useEffect(() => drawWave(inRef.current, original, "oklch(0.55 0.02 250)"), [original]);
  useEffect(() => drawWave(outRef.current, cleaned, "#c75d3a"), [cleaned]);
  useEffect(() => drawWave(augCanvasRef.current, augmented, "#4a9d6e"), [augmented]);

  /* ── Simple playback (no live effects — buffers are pre-rendered) ── */
  const stop = useCallback(() => {
    const player = playerRef.current;
    playerRef.current = null;
    if (player) {
      try {
        player.node.stop();
      } catch {
        /* source may have ended naturally */
      }
      void player.ctx.close();
    }
    setPlaying("none");
  }, []);

  const playBuffer = (
    buffer: AudioBuffer | null,
    which: "original" | "cleaned" | "augmented",
  ) => {
    stop();
    if (!buffer) return;
    const ctx = new AudioContext();
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(ctx.destination);
    node.onended = () => {
      if (playerRef.current?.node !== node) return;
      playerRef.current = null;
      void ctx.close();
      setPlaying("none");
    };
    node.start();
    playerRef.current = { ctx, node };
    setPlaying(which);
  };

  /* ── Load file — decode only, NO auto-cleaning ── */
  const loadFile = async (file: File) => {
    const operation = ++operationRef.current;
    stop();
    setNoiseStatus("Decoding audio…");
    setNoiseBusy(true);
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(await file.arrayBuffer());
      if (operation !== operationRef.current) return;
      setOriginal(buf);
      setCleaned(null);
      setAugmented(null);
      setFileName(file.name);
      setNoiseStatus(
        `${file.name} · ${buf.duration.toFixed(1)}s · ${buf.sampleRate} Hz · ${buf.numberOfChannels}ch`,
      );
      setAugStatus("");
    } catch {
      if (operation === operationRef.current) {
        setNoiseStatus("Could not decode that file. Try a standard .mp3 or .wav.");
      }
    } finally {
      if (ctx) await ctx.close();
      if (operation === operationRef.current) setNoiseBusy(false);
    }
  };

  /* ── Remove noise (Section 1) ── */
  const removeNoise = async () => {
    if (!original) return;
    const operation = ++operationRef.current;
    stop();
    setNoiseBusy(true);
    setNoiseStatus("Removing noise…");
    await new Promise((r) => setTimeout(r, 20));
    try {
      const result = await renderCleaned(original, settings, (s) => setNoiseStatus(s + "…"));
      if (operation === operationRef.current) {
        setCleaned(result);
        setAugmented(null);
        setNoiseStatus("Noise removed successfully.");
      }
    } catch (err) {
      if (operation === operationRef.current) {
        setNoiseStatus("Noise removal failed: " + (err as Error).message);
      }
    } finally {
      if (operation === operationRef.current) setNoiseBusy(false);
    }
  };

  /* ── Apply augmentation (Section 2) ── */
  const applyAugmentation = async () => {
    const source = selectedSource === "original" ? original : cleaned;
    if (!source) return;
    const operation = ++operationRef.current;
    stop();
    setAugBusy(true);
    setAugStatus("Applying augmentation…");
    await new Promise((r) => setTimeout(r, 20));
    try {
      const result = await renderAugmented(source, settings, (s) => setAugStatus(s + "…"));
      if (operation === operationRef.current) {
        setAugmented(result);
        setAugStatus("Augmentation applied. Play or download below.");
      }
    } catch (err) {
      if (operation === operationRef.current) {
        setAugStatus("Augmentation failed: " + (err as Error).message);
      }
    } finally {
      if (operation === operationRef.current) setAugBusy(false);
    }
  };

  /* ── Download helper ── */
  const download = (buffer: AudioBuffer | null, suffix: string) => {
    if (!buffer) return;
    const url = URL.createObjectURL(encodeMp3(buffer));
    const a = document.createElement("a");
    a.href = url;
    a.download = (fileName?.replace(/\.[^.]+$/, "") ?? "audio") + suffix + ".mp3";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /* ══════════════════════════════════════════════════════════════════ */
  /*                              RENDER                               */
  /* ══════════════════════════════════════════════════════════════════ */

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      {/* ── Header ── */}
      <header className="mb-6">
        <div className="flex items-center justify-center gap-3">
          <img
            src="./audio_augment_logo.webp"
            alt="Audio Augment logo"
            className="h-12 w-12 object-contain"
          />
          <h1 className="text-2xl font-bold tracking-tight text-accent">Audio Augment</h1>
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  SECTION 1 — NOISE & BACKGROUND REMOVAL                    */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) void loadFile(f);
        }}
        className="rounded-lg border border-dashed border-border bg-card p-5 shadow-[var(--shadow-panel)]"
      >
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Step 1 — Noise & background removal
        </p>

        {/* File upload */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
            Choose audio file
            <input
              type="file"
              accept=".mp3,.wav,audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void loadFile(f);
              }}
            />
          </label>
          <span className="text-sm text-muted-foreground">
            {noiseStatus || "…or drop an .mp3 / .wav here"}
          </span>
        </div>

        {/* Noise settings */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Knob
            label="Noise reduction"
            value={settings.denoise}
            min={0}
            max={1}
            onChange={(v) => set("denoise", v)}
          />
          <Knob
            label="De-hiss"
            value={settings.hiss}
            min={0}
            max={1}
            onChange={(v) => set("hiss", v)}
          />
          <Knob
            label="Breath / room gate"
            value={settings.breath}
            min={0}
            max={1}
            onChange={(v) => set("breath", v)}
          />
          <Knob
            label="De-esser"
            value={settings.deEss}
            min={0}
            max={1}
            onChange={(v) => set("deEss", v)}
          />
        </div>

        {/* Waveforms */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Original audio
            </p>
            <canvas ref={inRef} className="h-20 w-full rounded bg-secondary/60" />
          </div>
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-[0.2em] text-accent">
              Cleaned audio
            </p>
            <canvas ref={outRef} className="h-20 w-full rounded bg-secondary/60" />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            disabled={!original || noiseBusy}
            onClick={removeNoise}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-40"
          >
            {noiseBusy ? "Working…" : "Remove Noise"}
          </button>
          <button
            disabled={!original}
            onClick={() => (playing === "original" ? stop() : playBuffer(original, "original"))}
            className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-40"
          >
            {playing === "original" ? "⏹ Stop" : "▶ Play original"}
          </button>
          <button
            disabled={!cleaned}
            onClick={() => (playing === "cleaned" ? stop() : playBuffer(cleaned, "cleaned"))}
            className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-40"
          >
            {playing === "cleaned" ? "⏹ Stop" : "▶ Play cleaned"}
          </button>
          <button
            disabled={!cleaned}
            onClick={() => download(cleaned, "-cleaned")}
            className="rounded-md border border-accent px-4 py-2 text-sm text-accent disabled:opacity-40"
          >
            ⬇ Download cleaned audio
          </button>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════ */}
      {/*  SECTION 2 — AUDIO AUGMENTATION                             */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section className="mt-8 rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-panel)]">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Step 2 — Audio augmentation
        </p>

        {/* Source picker */}
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm text-muted-foreground">Source:</span>
          <button
            disabled={!original}
            onClick={() => setSelectedSource("original")}
            className={`rounded-md border px-3 py-2 text-sm disabled:opacity-40 ${selectedSource === "original" ? "border-accent bg-accent text-accent-foreground" : "border-border"}`}
          >
            Original audio
          </button>
          <button
            disabled={!cleaned}
            onClick={() => setSelectedSource("cleaned")}
            className={`rounded-md border px-3 py-2 text-sm disabled:opacity-40 ${selectedSource === "cleaned" ? "border-accent bg-accent text-accent-foreground" : "border-border"}`}
          >
            Cleaned audio
          </button>
          {augStatus && (
            <span className="text-sm text-muted-foreground">{augStatus}</span>
          )}
        </div>

        {/* Presets */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {Object.keys(PRESETS).map((name) => (
            <button
              key={name}
              onClick={() => setSettings((s) => ({ ...s, ...PRESETS[name] }))}
              className="rounded-md border border-border bg-secondary px-3 py-1.5 text-xs uppercase tracking-widest text-secondary-foreground transition-colors hover:border-accent hover:text-accent"
            >
              {name}
            </button>
          ))}
          <button
            onClick={() =>
              setSettings((s) => ({
                ...s,
                eqLow: defaultSettings.eqLow,
                eqMid: defaultSettings.eqMid,
                eqHigh: defaultSettings.eqHigh,
                resonance: defaultSettings.resonance,
                pitch: defaultSettings.pitch,
                harmonizer: defaultSettings.harmonizer,
                harmonizerInterval: defaultSettings.harmonizerInterval,
                chorus: defaultSettings.chorus,
                compressor: defaultSettings.compressor,
                saturation: defaultSettings.saturation,
                output: defaultSettings.output,
                reverb: defaultSettings.reverb,
                reverbSize: defaultSettings.reverbSize,
                delay: defaultSettings.delay,
                delayTime: defaultSettings.delayTime,
                delayFeedback: defaultSettings.delayFeedback,
                deEss: defaultSettings.deEss,
              }))
            }
            className="rounded-md border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            Reset
          </button>
        </div>

        {/* Augmentation panels */}
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Panel title="Equalizer">
            <Knob
              label="Low shelf"
              value={settings.eqLow}
              min={-18}
              max={18}
              step={0.5}
              unit=" dB"
              onChange={(v) => set("eqLow", v)}
            />
            <Knob
              label="Mid"
              value={settings.eqMid}
              min={-18}
              max={18}
              step={0.5}
              unit=" dB"
              onChange={(v) => set("eqMid", v)}
            />
            <Knob
              label="High shelf"
              value={settings.eqHigh}
              min={-18}
              max={18}
              step={0.5}
              unit=" dB"
              onChange={(v) => set("eqHigh", v)}
            />
            <Knob
              label="Resonance"
              value={settings.resonance}
              min={-1}
              max={1}
              onChange={(v) => set("resonance", v)}
            />
          </Panel>

          <Panel title="Voice">
            <Knob
              label="Pitch"
              value={settings.pitch}
              min={-12}
              max={12}
              step={1}
              unit=" st"
              onChange={(v) => set("pitch", v)}
            />
            <Knob
              label="Harmonizer mix"
              value={settings.harmonizer}
              min={0}
              max={1}
              onChange={(v) => set("harmonizer", v)}
            />
            <Knob
              label="Harmony interval"
              value={settings.harmonizerInterval}
              min={-12}
              max={12}
              step={1}
              unit=" st"
              onChange={(v) => set("harmonizerInterval", v)}
            />
            <Knob
              label="Chorus"
              value={settings.chorus}
              min={0}
              max={1}
              onChange={(v) => set("chorus", v)}
            />
          </Panel>

          <Panel title="Dynamics & colour">
            <Knob
              label="Compressor"
              value={settings.compressor}
              min={0}
              max={1}
              onChange={(v) => set("compressor", v)}
            />
            <Knob
              label="Saturation"
              value={settings.saturation}
              min={0}
              max={1}
              onChange={(v) => set("saturation", v)}
            />
            <Knob
              label="Output gain"
              value={settings.output}
              min={-12}
              max={12}
              step={0.5}
              unit=" dB"
              onChange={(v) => set("output", v)}
            />
          </Panel>

          <Panel title="Reverb">
            <Knob
              label="Mix"
              value={settings.reverb}
              min={0}
              max={1}
              onChange={(v) => set("reverb", v)}
            />
            <Knob
              label="Room size"
              value={settings.reverbSize}
              min={0.2}
              max={6}
              step={0.1}
              unit=" s"
              onChange={(v) => set("reverbSize", v)}
            />
          </Panel>

          <Panel title="Echo / delay">
            <Knob
              label="Mix"
              value={settings.delay}
              min={0}
              max={1}
              onChange={(v) => set("delay", v)}
            />
            <Knob
              label="Time"
              value={settings.delayTime}
              min={0.02}
              max={1.5}
              onChange={(v) => set("delayTime", v)}
            />
            <Knob
              label="Feedback"
              value={settings.delayFeedback}
              min={0}
              max={0.85}
              onChange={(v) => set("delayFeedback", v)}
            />
          </Panel>
        </div>

        {/* Augmented waveform */}
        <div className="mt-5">
          <p className="mb-1 text-[11px] uppercase tracking-[0.2em] text-[#4a9d6e]">
            Augmented audio
          </p>
          <canvas ref={augCanvasRef} className="h-20 w-full rounded bg-secondary/60" />
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            disabled={!(selectedSource === "original" ? original : cleaned) || augBusy}
            onClick={applyAugmentation}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-40"
          >
            {augBusy ? "Working…" : "Apply Augmentation"}
          </button>
          <button
            disabled={!augmented}
            onClick={() =>
              playing === "augmented" ? stop() : playBuffer(augmented, "augmented")
            }
            className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-40"
          >
            {playing === "augmented" ? "⏹ Stop" : "▶ Play augmented"}
          </button>
          <button
            disabled={!augmented}
            onClick={() => download(augmented, "-augmented")}
            className="rounded-md border border-accent bg-accent px-4 py-2 text-sm text-accent-foreground disabled:opacity-40"
          >
            ⬇ Download augmented audio
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <p className="mt-6 text-xs text-muted-foreground">
        © All right reserved 2026 | Creators AI Lab
      </p>
    </main>
  );
}
