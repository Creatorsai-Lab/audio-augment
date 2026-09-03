import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Panel } from "../components/Panel";
import { Knob } from "../components/Knob";
import { defaultSettings, renderProcessed, type Settings } from "../lib/audio/process";
import { encodeWav } from "../lib/audio/wav";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Clarity — Offline Voice Cleanup & Audio Studio" },
      {
        name: "description",
        content:
          "Drop an MP3 or WAV to strip background noise, hiss and breaths, then shape the voice with EQ, pitch, compressor, harmonizer, saturation, reverb, delay and chorus.",
      },
      { property: "og:title", content: "Clarity — Offline Voice Cleanup & Audio Studio" },
      {
        property: "og:description",
        content:
          "Signal-processing noise removal plus a full voice effects rack, running entirely in your browser.",
      },
    ],
  }),
  component: Studio,
});

const PRESETS: Record<string, Partial<Settings>> = {
  Podcast: {
    denoise: 0.7,
    hiss: 0.6,
    breath: 0.45,
    deEss: 0.4,
    compressor: 0.5,
    eqLow: 2,
    eqHigh: 3,
  },
  Radio: { denoise: 0.6, compressor: 0.75, saturation: 0.4, eqLow: 4, eqMid: -2, eqHigh: 4 },
  Cinematic: { denoise: 0.6, reverb: 0.28, reverbSize: 3.2, eqLow: 3, pitch: -2, saturation: 0.2 },
  Robot: { pitch: -5, harmonizer: 0.5, harmonizerInterval: 12, resonance: 0.6, chorus: 0.5 },
};

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

export function Studio() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [fileName, setFileName] = useState<string | null>(null);
  const [original, setOriginal] = useState<AudioBuffer | null>(null);
  const [processed, setProcessed] = useState<AudioBuffer | null>(null);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState<"none" | "original" | "processed">("none");

  const inRef = useRef<HTMLCanvasElement>(null);
  const outRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<{ ctx: AudioContext; node: AudioBufferSourceNode } | null>(null);
  const operationRef = useRef(0);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setSettings((s) => ({ ...s, [k]: v }));

  useEffect(() => drawWave(inRef.current, original, "oklch(0.55 0.02 250)"), [original]);
  useEffect(() => drawWave(outRef.current, processed, "oklch(0.8 0.13 190)"), [processed]);

  const stop = useCallback(() => {
    const player = playerRef.current;
    playerRef.current = null;
    if (player) {
      try {
        player.node.stop();
      } catch {
        // The source may already have ended naturally.
      }
      void player.ctx.close();
    }
    setPlaying("none");
  }, []);

  const play = (buffer: AudioBuffer | null, which: "original" | "processed") => {
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

  const loadFile = async (file: File) => {
    const operation = ++operationRef.current;
    stop();
    setStatus("Decoding audio…");
    setBusy(true);
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(await file.arrayBuffer());
      if (operation !== operationRef.current) return;
      setOriginal(buf);
      setProcessed(null);
      setFileName(file.name);
      setStatus(
        `${file.name} · ${buf.duration.toFixed(1)}s · ${buf.sampleRate} Hz · ${buf.numberOfChannels}ch`,
      );
    } catch {
      if (operation === operationRef.current) {
        setStatus("Could not decode that file. Try a standard .mp3 or .wav.");
      }
    } finally {
      if (ctx) await ctx.close();
      if (operation === operationRef.current) setBusy(false);
    }
  };

  const process = async () => {
    if (!original) return;
    const operation = ++operationRef.current;
    stop();
    setBusy(true);
    setStatus("Processing…");
    await new Promise((r) => setTimeout(r, 20));
    try {
      const result = await renderProcessed(original, settings, (s) => setStatus(s + "…"));
      if (operation === operationRef.current) {
        setProcessed(result);
        setStatus("Processed. Preview or export below.");
      }
    } catch (err) {
      if (operation === operationRef.current) {
        setStatus("Processing failed: " + (err as Error).message);
      }
    } finally {
      if (operation === operationRef.current) setBusy(false);
    }
  };

  const download = () => {
    if (!processed) return;
    const url = URL.createObjectURL(encodeWav(processed));
    const a = document.createElement("a");
    a.href = url;
    a.download = (fileName?.replace(/\.[^.]+$/, "") ?? "audio") + "-clarity.wav";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Clarity <span className="text-accent">Audio Desk</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Spectral noise removal and a full voice rack — everything runs locally, no uploads.
          </p>
        </div>
        <div className="flex gap-2">
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
            onClick={() => setSettings(defaultSettings)}
            className="rounded-md border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            Reset
          </button>
        </div>
      </header>

      <section
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) void loadFile(f);
        }}
        className="rounded-lg border border-dashed border-border bg-card p-5 shadow-[var(--shadow-panel)]"
      >
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
            {status || "…or drop an .mp3 / .wav here"}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Input
            </p>
            <canvas ref={inRef} className="h-20 w-full rounded bg-secondary/60" />
          </div>
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-[0.2em] text-accent">Processed</p>
            <canvas ref={outRef} className="h-20 w-full rounded bg-secondary/60" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            disabled={!original || busy}
            onClick={process}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-40"
          >
            {busy ? "Working…" : "Clean & apply effects"}
          </button>
          <button
            disabled={!original}
            onClick={() => (playing === "original" ? stop() : play(original, "original"))}
            className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-40"
          >
            {playing === "original" ? "Stop" : "Play original"}
          </button>
          <button
            disabled={!processed}
            onClick={() => (playing === "processed" ? stop() : play(processed, "processed"))}
            className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-40"
          >
            {playing === "processed" ? "Stop" : "Play processed"}
          </button>
          <button
            disabled={!processed}
            onClick={download}
            className="rounded-md border border-accent px-4 py-2 text-sm text-accent disabled:opacity-40"
          >
            Export WAV
          </button>
        </div>
      </section>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="Noise cleanup">
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
        </Panel>

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

      <p className="mt-6 text-xs text-muted-foreground">
        Cleanup uses STFT spectral gating with per-bin noise estimation — classic DSP, no language
        models involved.
      </p>
    </main>
  );
}
