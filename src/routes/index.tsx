import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Panel } from "../components/Panel";
import { Knob } from "../components/Knob";
import { Waveform } from "../components/Waveform";
import {
  augmentationKey,
  defaultSettings,
  EQ_BANDS,
  PitchCache,
  renderAugmented,
  renderCleaned,
  type RackAudio,
  type Settings,
} from "../lib/audio/process";
import { encodeMp3 } from "../lib/audio/mp3";
import { Player, type TrackAudio, type TrackId } from "../lib/audio/player";
import { isAbort } from "../lib/audio/worker-client";

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

/* ── Presets (augmentation-only, no cleanup keys) ── */
const PRESETS: Record<string, Partial<Settings>> = {
  Podcast: { compressor: 0.5, eq125: 2, eq250: 1, eq1k: 2, eq4k: 3, eq8k: 2 },
  Educational: { compressor: 0.4, eq125: -2, eq250: 1, eq500: 1, eq1k: 3, eq2k: 4, eq4k: 3, eq8k: 1 },
  Gaming: { compressor: 0.6, eq31: 4, eq63: 3, eq250: -1, eq1k: 2, eq4k: 4, eq8k: 3, eq16k: 2, saturation: 0.15 },
  Best: { compressor: 0.4, saturation: 0.1, eq125: 2, eq250: 1, eq1k: 2, eq4k: 3, eq8k: 2, output: 1 },
};

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/* ══════════════════════════════════════════════════════════════════════ */

export function Studio() {
  /* ── State ── */
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [fileName, setFileName] = useState<string | null>(null);
  const [original, setOriginal] = useState<AudioBuffer | null>(null);
  const [cleaned, setCleaned] = useState<AudioBuffer | null>(null);
  const [selectedSource, setSelectedSource] = useState<"original" | "cleaned">("original");
  /** Last offline render, and what it was rendered from. */
  const [augmented, setAugmented] = useState<{
    buffer: AudioBuffer;
    source: AudioBuffer;
    key: string;
  } | null>(null);
  /** What the live preview plays: the source after pitch shifting, plus the harmony voice. */
  const [rackAudio, setRackAudio] = useState<{ source: AudioBuffer; audio: RackAudio } | null>(
    null,
  );

  const [noiseStatus, setNoiseStatus] = useState<string>("");
  const [augStatus, setAugStatus] = useState<string>("");
  const [noiseBusy, setNoiseBusy] = useState(false);
  const [augBusy, setAugBusy] = useState(false);
  const [exporting, setExporting] = useState<"cleaned" | "augmented" | null>(null);
  const [transport, setTransport] = useState<{ track: TrackId | null; playing: boolean }>({
    track: null,
    playing: false,
  });

  const [player] = useState(() => new Player());
  const [pitchCache] = useState(() => new PitchCache());
  const loadRef = useRef(0);
  const noiseJob = useRef<AbortController | null>(null);
  const augJob = useRef<AbortController | null>(null);

  /* ── Settings helper ── */
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setSettings((s) => ({ ...s, [k]: v }));

  /* ── Derived ── */
  const augSource = selectedSource === "original" ? original : cleaned;
  const liveAudio = rackAudio && rackAudio.source === augSource ? rackAudio.audio : null;
  const augFresh =
    !!augmented && augmented.source === augSource && augmented.key === augmentationKey(settings);

  const audioFor = (track: TrackId): TrackAudio | null => {
    if (track === "augmented") return liveAudio;
    const main = track === "original" ? original : cleaned;
    return main && { main };
  };

  /* ── Transport ── */
  useEffect(() => {
    player.onChange = () => setTransport({ track: player.track, playing: player.playing });
    return () => player.dispose();
  }, [player]);

  // The live rack follows every control as it moves.
  useEffect(() => player.setSettings(settings), [player, settings]);

  const getPosition = useCallback(() => player.position(), [player]);

  const toggle = (track: TrackId) => {
    if (transport.playing && transport.track === track) return player.pause();
    const audio = audioFor(track);
    if (audio) player.play(track, audio);
  };

  const seek = (track: TrackId, seconds: number) => {
    const audio = audioFor(track);
    if (audio) player.seek(seconds, track, audio);
  };

  const playLabel = (track: TrackId, idle: string) =>
    transport.playing && transport.track === track ? "⏸ Pause" : idle;

  /* ── Live preview audio: pitch / harmony are pre-shifted in a worker ── */
  const { pitch, harmonizerInterval } = settings;
  const harmonise = settings.harmonizer > 0;
  useEffect(() => {
    if (!augSource) return setRackAudio(null);
    const voice = { pitch, harmonizer: harmonise ? 1 : 0, harmonizerInterval };
    const ready = pitchCache.peek(augSource, voice);
    if (ready) return setRackAudio({ source: augSource, audio: ready });

    // Wait for the knob to settle; the previous audio keeps playing meanwhile.
    const job = new AbortController();
    const timer = setTimeout(() => {
      setAugStatus("Updating pitch… 0%");
      pitchCache
        .prepare(augSource, voice, {
          signal: job.signal,
          onProgress: (f) => setAugStatus(`Updating pitch… ${percent(f)}`),
        })
        .then((audio) => {
          setRackAudio({ source: augSource, audio });
          setAugStatus("");
        })
        .catch((err) => {
          if (!isAbort(err)) setAugStatus("Pitch shift failed: " + message(err));
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      job.abort();
    };
  }, [augSource, pitch, harmonise, harmonizerInterval, pitchCache]);

  // When the audio behind the current track is replaced (re-cleaned, new pitch,
  // different source), swap it in at the playhead.
  useEffect(() => {
    const track = player.track;
    if (!track) return;
    const audio =
      track === "augmented"
        ? liveAudio
        : track === "original"
          ? original && { main: original }
          : cleaned && { main: cleaned };
    if (!audio || player.isCurrent(audio)) return;
    if (player.playing) player.play(track, audio);
    else player.seek(player.position(), track, audio);
  }, [player, original, cleaned, liveAudio]);

  /* ── Load file — decode only, NO auto-cleaning ── */
  const loadFile = async (file: File) => {
    const load = ++loadRef.current;
    noiseJob.current?.abort();
    noiseJob.current = null;
    augJob.current?.abort();
    augJob.current = null;
    player.stop();
    setNoiseStatus("Decoding audio…");
    setNoiseBusy(true);
    try {
      const buf = await player.context().decodeAudioData(await file.arrayBuffer());
      if (load !== loadRef.current) return;
      pitchCache.clear();
      setOriginal(buf);
      setCleaned(null);
      setAugmented(null);
      setSelectedSource("original");
      setFileName(file.name);
      setNoiseStatus(
        `${file.name} · ${buf.duration.toFixed(1)}s · ${buf.sampleRate} Hz · ${buf.numberOfChannels}ch`,
      );
      setAugStatus("");
    } catch {
      if (load === loadRef.current) {
        setNoiseStatus("Could not decode that file. Try a standard .mp3 or .wav.");
      }
    } finally {
      if (load === loadRef.current) setNoiseBusy(false);
    }
  };

  const dropFile = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) void loadFile(f);
  };

  /* ── Remove noise (Section 1) ── */
  const removeNoise = async () => {
    if (!original) return;
    noiseJob.current?.abort();
    const job = (noiseJob.current = new AbortController());
    setNoiseBusy(true);
    setNoiseStatus("Removing noise… 0%");
    try {
      const result = await renderCleaned(original, settings, {
        signal: job.signal,
        onProgress: (f) => setNoiseStatus(`Removing noise… ${percent(f)}`),
      });
      setCleaned(result);
      setSelectedSource("cleaned");
      setNoiseStatus("Noise removed successfully.");
    } catch (err) {
      if (!isAbort(err)) setNoiseStatus("Noise removal failed: " + message(err));
    } finally {
      if (noiseJob.current === job) {
        noiseJob.current = null;
        setNoiseBusy(false);
      }
    }
  };

  /* ── Render augmentation (Section 2) — needed for the waveform and export only ── */
  const renderAugmentation = async (): Promise<AudioBuffer | null> => {
    if (!augSource) return null;
    if (augFresh && augmented) return augmented.buffer;
    augJob.current?.abort();
    const job = (augJob.current = new AbortController());
    const source = augSource;
    const used = settings;
    setAugBusy(true);
    setAugStatus("Preparing augmentation…");
    try {
      const audio = await pitchCache.prepare(source, used, {
        signal: job.signal,
        onProgress: (f) => setAugStatus(`Shifting pitch… ${percent(f)}`),
      });
      setAugStatus("Applying effects…");
      const buffer = await renderAugmented(audio, used);
      if (job.signal.aborted) return null;
      setAugmented({ buffer, source, key: augmentationKey(used) });
      return buffer;
    } finally {
      if (augJob.current === job) {
        augJob.current = null;
        setAugBusy(false);
      }
    }
  };

  const applyAugmentation = async () => {
    try {
      if (await renderAugmentation()) setAugStatus("Augmentation applied. Download it below.");
    } catch (err) {
      if (!isAbort(err)) setAugStatus("Augmentation failed: " + message(err));
    }
  };

  /* ── Download helper ── */
  const download = async (kind: "cleaned" | "augmented") => {
    const setStatus = kind === "cleaned" ? setNoiseStatus : setAugStatus;
    setExporting(kind);
    try {
      const buffer = kind === "cleaned" ? cleaned : await renderAugmentation();
      if (!buffer) return;
      setStatus("Encoding MP3… 0%");
      const blob = await encodeMp3(buffer, {
        onProgress: (f) => setStatus(`Encoding MP3… ${percent(f)}`),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName?.replace(/\.[^.]+$/, "") ?? "audio"}-${kind}.mp3`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(`${kind === "augmented" ? "Augmented" : "Cleaned"} MP3 download started.`);
    } catch (err) {
      if (!isAbort(err)) setStatus(`Download failed: ${message(err)}`);
    } finally {
      setExporting(null);
    }
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
          <h1 className="text-2xl font-bold tracking-tight text-accent">Audio Augment</h1>
        </div>

        {/* Right Side: Action Buttons */}
        <div className="flex items-center gap-4">
          {/* Home Button */}
          <a
            href="https://audio-augment.vercel.app/"
            className="flex h-9 items-center justify-center gap-2 text-foreground"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </a>

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
              width="120"
              height="30"
              title="GitHub"
            ></iframe>
          </div>
        </div>
      </header>

      {/* File upload */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={dropFile}
        className="mb-5 flex items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-card p-4 select-none"
      >
        <label className="cursor-pointer rounded-md border-2 border-primary px-4 py-2 text-sm font-bold text-primary transition-all duration-150 active:translate-y-1">
          + Upload Audio
          <input
            type="file"
            accept=".mp3,.wav,audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadFile(f);
              e.target.value = ""; // allow re-picking the same file
            }}
          />
        </label>
        <span className="text-sm text-muted-foreground">
          {noiseStatus || "OR drag and drop a file here (MP3 or WAV)."}
        </span>
      </div>

      {/*  SECTION 1 — NOISE & BACKGROUND REMOVAL                    */}
      <section
        onDragOver={(e) => e.preventDefault()}
        onDrop={dropFile}
        className="rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-panel)]">

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
            <Waveform
              buffer={original}
              color="oklch(0.55 0.02 250)"
              active={transport.track === "original"}
              getPosition={getPosition}
              onSeek={(t) => seek("original", t)}
            />
            <button
              disabled={!original}
              onClick={() => toggle("original")}
              className="m-3 rounded-md border border-border px-4 py-2 text-sm disabled:opacity-40"
            >
              {playLabel("original", "▶ Play original")}
            </button>
            <button
              disabled={!original || noiseBusy}
              onClick={removeNoise}
              className="m-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-40 transition-all duration-150 active:translate-y-1">
              {noiseBusy ? "Working…" : "Remove Noise"}
            </button>

          </div>
          <div>
            <p className="mb-1 text-[12px] uppercase tracking-[0.2em] text-muted-foreground">
              Cleaned Audio Preview
            </p>
            <Waveform
              buffer={cleaned}
              color="#c75d3a"
              active={transport.track === "cleaned"}
              getPosition={getPosition}
              onSeek={(t) => seek("cleaned", t)}
            />
            <button
              disabled={!cleaned}
              onClick={() => toggle("cleaned")}
              className="m-3 rounded-md border border-border px-4 py-2 text-sm disabled:opacity-40"
            >
              {playLabel("cleaned", "▶ Play cleaned")}
            </button>
            <button
              disabled={!cleaned || exporting !== null}
              onClick={() => download("cleaned")}
              className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-80 disabled:opacity-40 transition-all duration-150 active:translate-y-1"
            >
              {exporting === "cleaned" ? "Exporting…" : "⬇ Download cleaned audio"}
            </button>
          </div>
        </div>
      </section>

      {/*  SECTION 2 — AUDIO AUGMENTATION                             */}
      <section className="mt-8 rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-panel)]">
        {/* Source picker */}
        <div className="flex flex-wrap items-center gap-4 border-b pb-4 align-center items-center justify-center">
          <span className="text-sm text-muted-foreground">Choose Source to Augment:</span>
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
          <Waveform
            buffer={augmented?.buffer ?? augSource}
            color="#c75d3a"
            dimmed={!augFresh}
            active={transport.track === "augmented"}
            getPosition={getPosition}
            onSeek={(t) => seek("augmented", t)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {augFresh
              ? "Waveform shows the rendered result."
              : "Play to hear your settings live as you turn the controls. The waveform updates when you apply or download."}
          </p>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            disabled={!augSource || augBusy}
            onClick={applyAugmentation}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-40 transition-all duration-150 active:translate-y-1"
          >
            {augBusy ? "Working…" : "Apply Augmentation"}
          </button>
          <button
            disabled={!liveAudio}
            onClick={() => toggle("augmented")}
            className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-40"
          >
            {playLabel("augmented", "▶ Play augmented (live)")}
          </button>
          <button
            disabled={!augSource || augBusy || exporting !== null}
            onClick={() => download("augmented")}
            className="rounded-md border cursor-pointer border-accent bg-accent px-4 py-2 text-sm font-bold text-accent-foreground disabled:opacity-40 transition-all duration-150 active:translate-y-1"
          >
            {exporting === "augmented" ? "Exporting…" : "⬇ Download augmented audio"}
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
                  "delayFeedback",
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
              step={0.2}
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
              min={-10}
              max={10}
              step={0.1}
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
              label="Reverb"
              value={settings.reverb}
              min={0}
              max={1}
              onChange={(v) => set("reverb", v)}
            />
            <Knob
              label="Reverb size"
              value={settings.reverbSize}
              min={0.1}
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
              label="Delay"
              value={settings.delay}
              min={0}
              max={1}
              onChange={(v) => set("delay", v)}
            />
            <Knob
              label="Delay Time"
              value={settings.delayTime}
              min={0.02}
              max={1.5}
              onChange={(v) => set("delayTime", v)}
            />
            <Knob
              label="Delay Feedback"
              value={settings.delayFeedback}
              min={0}
              step={0.1}
              max={1}
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
          A very simple and fast audio editing studio that works with great precision. It has been designed and developed for content creators and artists to edit their audio at their fingertips without any hassle.
        </p>

        {/* Features Grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-background p-5 transition-colors hover:bg-muted/30">
            <h3 className="mb-2 text-lg font-semibold text-secondary">
              How does it work?
            </h3>
            <p className="text-sm text-muted-foreground">
              Everything runs inside your browser using signal-processing
              algorithms. Upload an audio file, press play, and hear each effect
              change live as you turn the controls.
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
                No. Your audio never leaves your device. All processing happens
                locally in your browser, nothing is uploaded to a server, and
                your files are gone from memory as soon as you close the tab.
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
                Not at all. A good mic always helps, but the noise removal and
                enhancement tools are designed to clean up and enrich audio
                recorded on ordinary headsets or phone mics.
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
                Yes. The studio interface is fully responsive, so you can upload,
                process, and download audio directly from your smartphone's web
                browser. Very long recordings need more memory than some phones
                have, so a computer works best for those.
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
