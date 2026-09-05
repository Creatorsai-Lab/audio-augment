import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Panel } from "../components/Panel";
import { Knob } from "../components/Knob";
import {
  defaultSettings,
  EQ_BANDS,
  renderAugmented,
  renderCleaned,
  type Settings,
} from "../lib/audio/process";
import { encodeMp3 } from "../lib/audio/mp3";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Audio Augment | Audio Cleaner and Editor" },
      {
        name: "description",
        content:
          "A fast, simple, and precise audio editing studio built for creators and artists. Clean and edit your tracks effortlessly right at your fingertips.",
      },
      { property: "og:title", content: "Audio Augment | Audio Cleaner and Editor" },
      {
        property: "og:description",
        content:
          "A fast, simple, and precise audio editing studio built for creators and artists. Clean and edit your tracks effortlessly right at your fingertips.",
      },
    ],
  }),
  component: Studio,
});

/* ── Presets (augmentation-only, no noise keys) ── */
const PRESETS: Record<string, Partial<Settings>> = {
  Podcast: { compressor: 0.5, eq125: 2, eq250: 1, eq1k: 2, eq4k: 3, eq8k: 2, deEss: 0.4 },
  Educational: { compressor: 0.4, eq125: -2, eq250: 1, eq500: 1, eq1k: 3, eq2k: 4, eq4k: 3, eq8k: 1 },
  Cinematic: { reverb: 0.28, reverbSize: 3.2, eq63: 3, eq125: 2, eq250: 1, pitch: -2, saturation: 0.2 },
  Gaming: { compressor: 0.6, eq31: 4, eq63: 3, eq250: -1, eq1k: 2, eq4k: 4, eq8k: 3, eq16k: 2, saturation: 0.15 },
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
  useEffect(() => drawWave(augCanvasRef.current, augmented, "#c75d3a"), [augmented]);

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
      <header className="mb-16 flex flex-col items-center justify-between gap-6 sm:flex-row sm:gap-0">
        {/* Left Side: Logo & Name */}
        <div className="flex cursor-pointer select-none items-center gap-3">
          <img
            src="./audio_augment_logo.webp"
            alt="Audio Augment logo"
            className="h-12 w-12 object-contain"
          />
          <h1 className="text-2xl font-bold tracking-tight text-accent">
            Audio Augment
          </h1>
        </div>

        {/* Right Side: Action Buttons */}
        <div className="flex items-center gap-4">
          {/* Creators AI Lab Button - Glowing Animated Background */}
          <div className="group relative">
            {/* Animated Glow Layer */}
            <div className="absolute -inset-0.5 animate-pulse rounded-md transition duration-300 group-hover:opacity-100"></div>
            <a
              href="https://creatorsai-lab.github.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="relative flex h-9 items-center justify-center rounded-md bg-[linear-gradient(90deg,#eab308,#3b82f6,#8b5cf6,#22c55e)] bg-[length:300%_300%] px-4 py-2 text-sm font-bold tracking-wide text-white transition-opacity hover:opacity-90"
              style={{
                animation: "gradientMove 6s ease infinite",
              }}
            >
              <style>{`
    @keyframes gradientMove {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
  `}</style>
              Creators AI Lab
            </a>
          </div>
          {/* GitHub Star Button Widget */}
          <div className="flex h-8 items-center font-normal justify-center pt-1">
            <iframe
              src="https://ghbtns.com/github-btn.html?user=Creatorsai-Lab&repo=audio-augment&type=star&count=true&size=large"
              width="150"
              height="25"
              title="GitHub"
            ></iframe>
          </div>
        </div>
      </header>

      {/* File upload */}
      <div className="mb-5 flex items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-card p-4 select-none">
        <label className="cursor-pointer rounded-md border-2 border-primary px-4 py-2 text-sm font-bold text-primary transition-all duration-150 active:translate-y-1">
          + Upload Audio
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
          {noiseStatus || "OR drag and drop (MP3 and WAV only)."}
        </span>
      </div>

      {/*  SECTION 1 — NOISE & BACKGROUND REMOVAL                    */}
      <section
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) void loadFile(f);
        }}
        className="rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-panel)]"
      >

        {/* Noise settings */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-panel)]">
          <Knob
            label="Noise reduction"
            value={settings.denoise}
            min={0}
            max={1}
            onChange={(v) => set("denoise", v)}
          />
          <Knob
            label="Hissing reduction"
            value={settings.hiss}
            min={0}
            max={1}
            onChange={(v) => set("hiss", v)}
          />
          <Knob
            label="Breath reduction"
            value={settings.breath}
            min={0}
            max={1}
            onChange={(v) => set("breath", v)}
          />
          <Knob
            label="Sibilance reduction"
            value={settings.deEss}
            min={0}
            max={1}
            onChange={(v) => set("deEss", v)}
          />
        </div>

        {/* Waveforms */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[12px] uppercase tracking-[0.2em] text-muted-foreground">
              Original Audio Preview
            </p>
            <canvas ref={inRef} className="h-17 w-full rounded bg-secondary/60" />
            <button
              disabled={!original}
              onClick={() => (playing === "original" ? stop() : playBuffer(original, "original"))}
              className="m-3 rounded-md border border-border px-4 py-2 text-sm disabled:opacity-40"
            >
              {playing === "original" ? "⏹ Stop" : "▶ Play original"}
            </button>
            <button
              disabled={!original || noiseBusy}
              onClick={removeNoise}
              className="m-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-40 transition-all duration-150 active:translate-y-1"
            >
              {noiseBusy ? "Working…" : "Remove Noise"}
            </button>

          </div>
          <div>
            <p className="mb-1 text-[12px] uppercase tracking-[0.2em] text-muted-foreground">
              Cleaned Audio Preview
            </p>
            <canvas ref={outRef} className="h-17 w-full rounded bg-secondary/60" />
            <button
              disabled={!cleaned}
              onClick={() => (playing === "cleaned" ? stop() : playBuffer(cleaned, "cleaned"))}
              className="m-3 rounded-md border border-border px-4 py-2 text-sm disabled:opacity-40"
            >
              {playing === "cleaned" ? "⏹ Stop" : "▶ Play cleaned"}
            </button>
            <button
              disabled={!cleaned}
              onClick={() => download(cleaned, "-cleaned")}
              className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-80 disabled:opacity-40 transition-all duration-150 active:translate-y-1"
            >
              ⬇ Download cleaned audio
            </button>
          </div>
        </div>
      </section>

      {/*  SECTION 2 — AUDIO AUGMENTATION                             */}
      <section className="mt-8 rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-panel)]">
        {/* Source picker */}
        <div className="flex flex-wrap items-center gap-4 border-b pb-4 align-center items-center justify-center">
          <span className="text-sm text-muted-foreground">Source:</span>
          <button
            disabled={!original}
            onClick={() => setSelectedSource("original")}
            className={`rounded-md border px-3 py-2 text-sm disabled:opacity-40 ${selectedSource === "original" ? "cursor-pointer rounded-md border-2 border-primary px-4 py-2 text-sm font-bold text-primary" : "border-border"}`}
          >
            Original audio
          </button>
          <button
            disabled={!cleaned}
            onClick={() => setSelectedSource("cleaned")}
            className={`rounded-md border px-3 py-2 text-sm disabled:opacity-40 ${selectedSource === "cleaned" ? "cursor-pointer rounded-md border-2 border-primary px-4 py-2 text-sm font-bold text-primary" : "border-border"}`}
          >
            Cleaned audio
          </button>
          {augStatus && (
            <span className="text-sm text-muted-foreground">{augStatus}</span>
          )}
        </div>

        {/* Augment Audio Preview */}

        <div className="mt-5">
          <p className="mb-1 text-[12px] uppercase tracking-[0.2em] text-muted-foreground">
            Augmented Audio Preview
          </p>
          <canvas ref={augCanvasRef} className="h-17 w-full rounded bg-secondary/60" />
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            disabled={!(selectedSource === "original" ? original : cleaned) || augBusy}
            onClick={applyAugmentation}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-40 transition-all duration-150 active:translate-y-1"
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
            className="rounded-md border cursor-pointer border-accent bg-accent px-4 py-2 text-sm font-bold text-accent-foreground disabled:opacity-40 transition-all duration-150 active:translate-y-1"
          >
            ⬇ Download augmented audio
          </button>
        </div>


        {/* Presets and Augmentation panels */}
        <div className="mt-5 flex flex-col gap-4 md:flex-row md:flex-wrap md:items-stretch">
          {/* Preset Buttons */}
          <div className="flex w-full flex-col gap-3 px-2 md:w-[calc(20%-0.67rem)]">
            <p className="mb-4 text-[13px] font-semibold uppercase tracking-[0.2em] text-accent">Presets</p>
            {Object.keys(PRESETS).map((name) => (
              <button
                key={name}
                onClick={() => setSettings((s) => ({ ...s, ...PRESETS[name] }))}
                className="w-full cursor-pointer rounded-md border border-border bg-secondary px-3 py-2 text-center text-xs uppercase tracking-widest text-secondary-foreground transition-all duration-150 active:translate-y-1"
              >
                {name}
              </button>
            ))}
            <button
              onClick={() => {
                const augKeys = [
                  ...EQ_BANDS.map((b) => b.key),
                  "pitch", "harmonizer", "harmonizerInterval",
                  "chorus", "compressor", "saturation", "output",
                  "reverb", "reverbSize", "delay", "delayTime",
                  "delayFeedback", "deEss",
                ] as const;
                setSettings((s) => {
                  const next = { ...s };
                  for (const k of augKeys) {
                    (next as Record<string, number>)[k] = defaultSettings[k];
                  }
                  return next;
                });
              }}
              className="w-full cursor-pointer rounded-md border border-border px-3 py-1.5 text-center text-xs uppercase tracking-widest text-muted-foreground transition-all duration-150 active:translate-y-1"
            >
              Reset
            </button>
          </div>

          <Panel title="10-Band Equalizer" className="flex w-full flex-col md:w-[calc(45%-0.67rem)]">
            <div className="grid h-full flex-1 grid-cols-5 gap-x-3 gap-y-3 sm:grid-cols-10">
              {EQ_BANDS.map((band) => (
                <div key={band.key} className="flex h-full flex-col items-center justify-between gap-1">
                  <span className="font-mono text-[10px] text-accent">
                    {settings[band.key].toFixed(0)} dB
                  </span>
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={1}
                    value={settings[band.key]}
                    onChange={(e) => set(band.key, parseFloat(e.target.value))}
                    className="fader w-5 flex-1 min-h-[120px]"
                    style={{
                      writingMode: "vertical-lr" as const,
                      direction: "rtl" as const,
                    }}
                    title={`${band.label}`}
                  />
                  <div className="flex flex-col items-center">
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {band.label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Voice" className="w-full md:w-[calc(33%-0.67rem)] md:flex-grow">
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

          <Panel title="Reverb" className="w-full md:w-[calc(33.33%-0.67rem)]">
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

          <Panel title="Dynamics & colour" className="w-full md:w-[calc(33.33%-0.67rem)]">
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

          <Panel title="Echo / delay" className="w-full md:w-[calc(33.33%-0.67rem)]">
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
      </section>
      <section className="mx-auto w-full space-y-12 py-8 text-foreground">
        {/* Hero Description Card */}
        <h3 className="mb-4 text-center text-2xl font-bold text-primary">
          What is Audio Augment Studio ?
        </h3>
        <p className="text-center leading-relaxed text-muted-foreground">
          A very simple and fast audio editing studio that works with great precision. It has been designed and developed for content creators and artiststo edit their audio at their fingertips without any hassle.
        </p>

        {/* Features Grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-background p-5 transition-colors hover:bg-muted/30">
            <h3 className="mb-2 text-lg font-semibold text-secondary">
              How does it work?
            </h3>
            <p className="text-sm text-muted-foreground">
              The app uses advanced audio processing algorithms to enhance your
              voice. Simply upload an audio file, select the desired effects, and
              the app will process it in real-time.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-background p-5 transition-colors hover:bg-muted/30">
            <h3 className="mb-2 text-lg font-semibold text-secondary">
              Who is it for?
            </h3>
            <p className="text-sm text-muted-foreground">
              Musicians, podcasters, content creators, and absolutely anyone who
              wants to dramatically improve the quality of their vocal recordings.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-background p-5 transition-colors hover:bg-muted/30">
            <h3 className="mb-2 text-lg font-semibold text-secondary">
              Why use it?
            </h3>
            <p className="text-sm text-muted-foreground">
              It's fast, incredibly easy to use, and delivers professional results
              instantly. You can safely experiment with settings to find your
              perfect signature sound.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-background p-5 transition-colors hover:bg-muted/30">
            <h3 className="mb-2 text-lg font-semibold text-secondary">
              How to use it?
            </h3>
            <p className="text-sm text-muted-foreground">
              Upload a file, select your effects, adjust the dials to fine-tune
              your sound, and simply hit download to grab your studio-ready track
              for your projects.
            </p>
          </div>
        </div>

        {/* Dropdown FAQ Section */}
        <h3 className="mb-8 text-center text-2xl font-bold text-primary">
          Frequently Asked Questions
        </h3>
        <div className="space-y-4">

          {/* FAQ 1 */}
          <details className="group rounded-lg border border-border bg-background [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer items-center justify-between p-4 text-foreground transition-colors hover:bg-muted/30">
              <h3 className="m-0 text-base font-medium">
                What audio formats are supported?
              </h3>
              <span className="ml-4 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary transition-transform duration-200 group-open:rotate-180">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </span>
            </summary>
            <div className="px-4 pb-4 text-sm text-muted-foreground">
              <p>
                We currently support MP3 and WAV files for upload.
                You can export your finished tracks in high quality MP3.
              </p>
            </div>
          </details>

          {/* FAQ 2 */}
          <details className="group rounded-lg border border-border bg-background [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer items-center justify-between p-4 text-foreground transition-colors hover:bg-muted/30">
              <h3 className="m-0 text-base font-medium">
                Is my audio stored on your servers?
              </h3>
              <span className="ml-4 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary transition-transform duration-200 group-open:rotate-180">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </span>
            </summary>
            <div className="px-4 pb-4 text-sm text-muted-foreground">
              <p>
                Your privacy is our priority. Audio processing happens securely, and
                we immediately delete your raw and processed files from our servers
                the moment your session ends.
              </p>
            </div>
          </details>

          {/* FAQ 3 */}
          <details className="group rounded-lg border border-border bg-background [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer items-center justify-between p-4 text-foreground transition-colors hover:bg-muted/30">
              <h3 className="m-0 text-base font-medium">
                Do I need a professional microphone?
              </h3>
              <span className="ml-4 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary transition-transform duration-200 group-open:rotate-180">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </span>
            </summary>
            <div className="px-4 pb-4 text-sm text-muted-foreground">
              <p>
                Not at all! While a good mic always helps, our AI and enhancement
                algorithms are explicitly trained to clean up noise and enrich audio
                recorded on cheap headsets or phone mics.
              </p>
            </div>
          </details>

          {/* FAQ 4 */}
          <details className="group rounded-lg border border-border bg-background [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer items-center justify-between p-4 text-foreground transition-colors hover:bg-muted/30">
              <h3 className="m-0 text-base font-medium">
                Can I use Audio Augment Studio on mobile?
              </h3>
              <span className="ml-4 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary transition-transform duration-200 group-open:rotate-180">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </span>
            </summary>
            <div className="px-4 pb-4 text-sm text-muted-foreground">
              <p>
                Yes. Our studio interface is fully responsive. You can record,
                upload, process, and download audio directly from your smartphone's
                web browser using our website or if you want you can download the web app for free.
              </p>
            </div>
          </details>

        </div>
      </section>

      {/* ── Footer ── */}
      <p className="mt-6 text-md text-muted-foreground text-center font">
        © All right reserved • Audio Augment Studio | Creators AI Lab • 2026
      </p>
    </main>
  );
}
