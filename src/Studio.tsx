// The studio page. All behaviour comes from useStudio; this file is the
// interface: upload at the top, then three sections on one page (trim, remove
// noise, augment), each with its own playback and download.
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Timeline } from "./components/Timeline";
import { Waveform } from "./components/Waveform";
import { EQ_BANDS } from "./lib/audio/process";
import type { TrackId } from "./lib/audio/player";
import { PRESETS, useStudio, type StudioState } from "./useStudio";
import { button } from "./components/classes";
import { Dial, EqFader, GitHubMark, Icon, Segmented, type IconName } from "./components/controls";

const clock = (seconds: number) => {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
};

const percentIn = (status: string) => {
  const match = /(\d+)%/.exec(status);
  return match ? Number(match[1]) : null;
};

/* ══════════════════════════════════════════════════════════════════════ */

export function Studio() {
  const s = useStudio();

  const openFile = (file: File | undefined, mode: "replace" | "append") => {
    if (file) void s.loadFile(file, mode);
  };

  return (
    <div
      className="flex min-h-dvh flex-col"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        // The first file starts the project; later drops add to the timeline.
        // (Dropping on the upload box itself always starts a new project.)
        openFile(e.dataTransfer.files[0], s.tracks.length === 0 ? "replace" : "append");
      }}
    >
      <Header />

      <main className="rise-in mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] flex-1 gap-14 px-4 pb-20 pt-8 sm:px-6 sm:pt-10">
        <Upload s={s} onFile={(f) => openFile(f, "replace")} />
        <Trim s={s} onAdd={(f) => openFile(f, "append")} />
        <RemoveNoise s={s} />
        <Augment s={s} />
      </main>

      <footer className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted-foreground sm:px-6">
          © 2026 Audio Augment · Creators AI Lab · Everything runs on your device.
        </p>
      </footer>
    </div>
  );
}

/* ── Header ─────────────────────────────────────────────────────────── */

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <a
          href="https://audio-augment.vercel.app/"
          className="flex items-center gap-2.5"
          aria-label="Audio Augment home"
        >
          {/* Mark: three level bars inside a ring */}
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
            <circle cx="13" cy="13" r="12" fill="none" stroke="currentColor" strokeWidth="1.25" />
            <path
              d="M8.5 11v4M13 7.5v11M17.5 10v6"
              stroke="var(--primary)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span className="text-[17px] font-semibold tracking-tight">
            Audio <span className="serif-accent text-[20px]">Augment</span>
          </span>
        </a>

        <div className="ml-auto flex items-center gap-2">
          <a
            href="https://github.com/Creatorsai-Lab/audio-augment"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Audio Augment on GitHub"
            title="Source code on GitHub"
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground sm:inline-flex"
          >
            <GitHubMark />
          </a>
          {/* The lab is the page's one call to action: the only filled-accent
              element in the header, with a live dot to draw the eye. */}
          <a
            href="https://creatorsai-lab.github.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex h-9 items-center gap-2 rounded-full border border-primary/50 bg-primary/10 pl-3 pr-3 text-[13px] font-semibold text-primary transition hover:border-primary hover:bg-primary hover:text-primary-foreground active:scale-[0.97]"
          >
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70 group-hover:bg-primary-foreground" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary group-hover:bg-primary-foreground" />
            </span>
            Creators AI Lab
            <span className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
              <Icon name="external" size={14} />
            </span>
          </a>
        </div>
      </div>
    </header>
  );
}

/* ── Shared section pieces ──────────────────────────────────────────── */

function SectionHead(p: {
  /** Element id of the title, referenced by the section's aria-labelledby. */
  id: string;
  number: string;
  title: string;
  blurb: string;
  status?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
  <div className="flex flex-wrap items-baseline gap-x-2">
  <p className="font-mono stage-title text-lg text-primary">{p.number}</p>
  <h2 id={p.id} className="stage-title text-lg">{p.title}</h2>
  <p className="mt-1 w-full text-sm text-muted-foreground">{p.blurb}</p>
</div>
      {p.children}
      {p.status && (
        <p className="w-full font-mono text-xs text-muted-foreground" aria-live="polite">
          {p.status}
        </p>
      )}
    </div>
  );
}

/**
 * One section's playback row: play / pause, the time, an optional A/B switch
 * (children) and the section's actions on the right.
 */
function Transport(p: {
  /** What this plays, for the button's accessible name. */
  label: string;
  track: TrackId;
  buffer: AudioBuffer | null;
  s: StudioState;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const { s, track, buffer } = p;
  const { getPosition } = s;
  const timeRef = useRef<HTMLSpanElement>(null);
  const active = s.transport.track === track;
  const playing = active && s.transport.playing;
  const duration = buffer?.duration ?? 0;

  // The readout is written straight to the DOM every frame.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const pos = active ? Math.min(duration, getPosition()) : 0;
      if (timeRef.current) timeRef.current.textContent = clock(pos);
      if (active) frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [active, duration, getPosition]);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <button
        onClick={() => s.toggle(track)}
        disabled={!buffer}
        aria-label={`${playing ? "Pause" : "Play"} ${p.label}`}
        title={`${playing ? "Pause" : "Play"} ${p.label}`}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition active:scale-95 disabled:opacity-30"
      >
        <Icon name={playing ? "pause" : "play"} size={20} />
      </button>
      <div className="min-w-[5.5rem] font-mono text-sm tabular-nums leading-tight">
        <span ref={timeRef}>0:00.0</span>
        <span className="block text-[11px] text-muted-foreground">of {clock(duration)}</span>
      </div>
      {p.children}
      {p.actions && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          {p.actions}
        </div>
      )}
    </div>
  );
}

function DownloadButton(p: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`${button.primary} w-full sm:w-auto`}
      disabled={p.disabled}
      onClick={p.onClick}
    >
      <Icon name="download" /> {p.busy ? "Exporting…" : p.label}
    </button>
  );
}

function WaveBlock(p: { label: string; note?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <span className="label-caps">{p.label}</span>
        {p.note && <span className="text-xs text-muted-foreground">{p.note}</span>}
      </div>
      {p.children}
    </div>
  );
}

/* ── Upload ─────────────────────────────────────────────────────────── */

function Upload({ s, onFile }: { s: StudioState; onFile: (file: File | undefined) => void }) {
  // Describe the uploaded file itself; the timeline may since have reshaped it.
  const loaded = s.tracks.find((t) => t.name === s.fileName)?.source ?? s.original;
  // Decoding progress and decode errors are reported through the same line.
  const notice = /Decoding|Could not/.test(s.noiseStatus) ? s.noiseStatus : "";

  const input = (
    <input
      type="file"
      accept=".mp3,.wav,audio/*"
      className="sr-only"
      onChange={(e) => {
        onFile(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );
  const drop = {
    onDragOver: (e: DragEvent) => e.preventDefault(),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onFile(e.dataTransfer.files[0]);
    },
  };

  if (loaded) {
    return (
      <section aria-label="Upload" {...drop}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-dashed border-border px-4 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon name="check" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{s.fileName ?? "Recording"}</p>
            <p className="font-mono text-xs text-muted-foreground" aria-live="polite">
              {notice ||
                `${clock(loaded.duration)} · ${(loaded.sampleRate / 1000).toFixed(1)} kHz · ${loaded.numberOfChannels === 1 ? "mono" : "stereo"}`}
            </p>
          </div>
          <label className={`${button.quiet} w-full cursor-pointer sm:w-auto`}>
            <Icon name="upload" size={16} /> Upload another
            {input}
          </label>
        </div>
      </section>
    );
  }

  return (
    <section className="group relative block cursor-pointer overflow-hidden rounded-2xl border border-dashed border-border px-5 py-5 text-center transition hover:border-primary/70 sm:py-12" aria-label="Upload" {...drop}>
        <div className="grid-paper pointer-events-none absolute inset-0" />
        <div className="relative">

          <p className="mt-6 text-lg font-semibold tracking-tight sm:text-xl">
            Start with a <span className="serif-accent text-[1.2em]"> Audio</span>
          </p>
          <span className={`${button.primary} mt-6 w-full sm:w-auto`}>
            <Icon name="upload" /> Upload audio
          </span>
          <p className="mt-3 text-[13px] text-muted-foreground" aria-live="polite">
            {notice || "OR drag drop a file anywhere · MP3 or WAV"}
          </p>
        </div>
        {input}
    </section>
  );
}

/* ── 01 Trim ────────────────────────────────────────────────────────── */

function Tool(p: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={p.onClick}
      disabled={p.disabled}
      aria-label={p.label}
      aria-pressed={p.active}
      title={p.label}
      className={`inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-xl px-2.5 text-[13px] transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-35 ${
        p.active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
      }`}
    >
      <Icon name={p.icon} />
      <span className="hidden md:inline">{p.label}</span>
    </button>
  );
}

function Trim({ s, onAdd }: { s: StudioState; onAdd: (file: File | undefined) => void }) {
  const [speedOpen, setSpeedOpen] = useState(false);
  // The slider moves freely; the stretch itself runs when it is released.
  const [draftSpeed, setDraftSpeed] = useState<number | null>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const noTrack = s.activeTrack === null;
  const speed = draftSpeed ?? s.activeSpeed;

  const applySpeed = (value: number) => {
    setDraftSpeed(null);
    if (value !== s.activeSpeed) void s.changeSpeed(value);
  };

  return (
    <section aria-labelledby="trim-title">
      <SectionHead
        id="trim-title"
        number="01"
        title="Trim"
        blurb="Trim, repeat, change speed and join clips."
        status={s.editStatus}
      />
      <input
        ref={addRef}
        type="file"
        accept=".mp3,.wav,audio/*"
        className="sr-only"
        onChange={(e) => {
          onAdd(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <div className="panel overflow-hidden">
        <div className="flex items-center gap-0.5 p-1.5">
          <Tool icon="plus" label="Add audio" onClick={() => addRef.current?.click()} />
          <span className="mx-1 h-5 w-px bg-border" />
          <Tool icon="copy" label="Duplicate" onClick={s.duplicateTrack} disabled={noTrack} />
          <Tool
            icon="speed"
            label={s.activeSpeed === 1 ? "Speed" : `Speed ${s.activeSpeed}×`}
            onClick={() => {
              setDraftSpeed(null);
              setSpeedOpen(!speedOpen);
            }}
            disabled={noTrack}
            active={speedOpen && !noTrack}
          />
          <Tool icon="trash" label="Remove" onClick={s.removeTrack} disabled={noTrack} />
          <span className="ml-auto" />
          <Tool icon="undo" label="Undo" onClick={s.undo} disabled={!s.canUndo} />
          <Tool icon="redo" label="Redo" onClick={s.redo} disabled={!s.canRedo} />
        </div>

        {speedOpen && !noTrack && (
          <div className="flex items-end gap-3 border-b border-border px-4 py-3">
            <div className="max-w-sm flex-1">
              <Dial
                label="Speed of the selected clip · pitch stays the same"
                value={speed}
                min={0.5}
                max={2}
                step={0.05}
                unit="×"
                onChange={setDraftSpeed}
                onCommit={() => draftSpeed !== null && applySpeed(draftSpeed)}
              />
            </div>
            <button
              className={`${button.quiet} h-9`}
              disabled={speed === 1}
              onClick={() => applySpeed(1)}
            >
              Reset
            </button>
          </div>
        )}

        <div className="p-3 sm:p-4">
          {s.tracks.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Upload an audio above to start trimming.
            </p>
          ) : (
            <Timeline
              tracks={s.tracks}
              activeId={s.activeTrack}
              transport={s.transport}
              getPosition={s.getPosition}
              onActivate={s.setActiveTrack}
              onSeek={(t) => s.seek("edit", t)}
              onChange={s.placeTrack}
            />
          )}
        </div>

        <div className="border-t border-border p-3 sm:px-4">
          <Transport
            label="all tracks"
            track="edit"
            buffer={s.mix}
            s={s}
            actions={
              <>
                <button
                  className={`${button.quiet} h-11 w-full sm:w-auto`}
                  disabled={s.sent}
                  onClick={s.sendToPipeline}
                  title="Use the timeline's result as the audio for noise removal and effects"
                >
                  {s.sent && s.original ? (
                    <>
                      <Icon name="check" size={16} /> In noise removal
                    </>
                  ) : (
                    <>
                      Use in noise removal <Icon name="arrowDown" size={16} />
                    </>
                  )}
                </button>
                <DownloadButton
                  label="Download combined audio"
                  busy={s.exporting === "edited"}
                  disabled={!s.mix || s.exporting !== null}
                  onClick={() => void s.download("edited")}
                />
              </>
            }
          />
        </div>
      </div>
      <p className="text-sm my-3 text-accent"><b>Usage:</b> Pull the audio track edge yellow bar to trim • Drag the track to move or reposition it • Tap the time scale to move the playhead</p>
    </section>
  );
}

/* ── 02 Remove Noise ────────────────────────────────────────────────── */

function RemoveNoise({ s }: { s: StudioState }) {
  const [hearCleaned, setHearCleaned] = useState(false);
  // The same line also carries the file description; only show it while it reports work.
  const working = / Hz · /.test(s.noiseStatus) ? "" : s.noiseStatus;
  const progress = s.noiseBusy ? percentIn(s.noiseStatus) : null;
  const track: TrackId = hearCleaned && s.cleaned ? "cleaned" : "original";

  // Once noise removal finishes, the obvious next thing is to listen to the
  // result — including when the "before" audio is already playing.
  const latest = useRef(s);
  latest.current = s;
  const cleaned = s.cleaned;
  useEffect(() => {
    setHearCleaned(cleaned !== null);
    const now = latest.current;
    if (cleaned && now.transport.playing && now.transport.track === "original") {
      now.toggle("cleaned");
    }
  }, [cleaned]);

  /** Switch between before and after; if this section is playing, carry on from the same moment. */
  const listenTo = (after: boolean) => {
    setHearCleaned(after);
    const next: TrackId = after ? "cleaned" : "original";
    const mine = s.transport.track === "original" || s.transport.track === "cleaned";
    if (s.transport.playing && mine && s.transport.track !== next) s.toggle(next);
  };

  return (
    <section aria-labelledby="noise-title">
      <SectionHead
        id="noise-title"
        number="02"
        title="Remove Noise"
        blurb="Take out noise, hiss, breaths and harsh S sounds."
        status={working}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="panel p-5">
          <div className="grid gap-4">
            <Dial
              label="Noise"
              value={s.settings.denoise}
              min={0}
              max={1}
              onChange={(v) => s.set("denoise", v)}
            />
            <Dial
              label="Hiss"
              value={s.settings.hiss}
              min={0}
              max={1}
              onChange={(v) => s.set("hiss", v)}
            />
            <Dial
              label="Breaths"
              value={s.settings.breath}
              min={0}
              max={1}
              onChange={(v) => s.set("breath", v)}
            />
            <Dial
              label="Sibilance"
              value={s.settings.deEss}
              min={0}
              max={1}
              onChange={(v) => s.set("deEss", v)}
            />
          </div>
          <button
            className={`${button.primary} relative mt-5 w-full overflow-hidden`}
            disabled={!s.original || s.noiseBusy}
            onClick={() => void s.removeNoise()}
          >
            {progress !== null && (
              <span
                className="absolute inset-y-0 left-0 bg-black/15 transition-[width]"
                style={{ width: `${progress}%` }}
              />
            )}
            <span className="relative">
              {s.noiseBusy
                ? `Removing noise… ${progress ?? 0}%`
                : s.cleaned
                  ? "Remove noise again"
                  : "Remove noise"}
            </span>
          </button>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Higher values remove more, but can thin the voice. Start in the middle and compare.
          </p>
        </div>

        <div className="panel grid content-start gap-5 p-5">
          <WaveBlock label="Before">
            <Waveform
              buffer={s.original}
              active={s.transport.track === "original"}
              getPosition={s.getPosition}
              onSeek={(t) => s.seek("original", t)}
            />
          </WaveBlock>
          <WaveBlock
            label="After"
            {...(s.cleaned ? {} : { note: "Press Remove noise to hear the difference" })}
          >
            <Waveform
              buffer={s.cleaned}
              active={s.transport.track === "cleaned"}
              getPosition={s.getPosition}
              onSeek={(t) => s.seek("cleaned", t)}
            />
          </WaveBlock>

          <div className="border-t border-border pt-4">
            <Transport
              label={track === "cleaned" ? "cleaned audio" : "original audio"}
              track={track}
              buffer={track === "cleaned" ? s.cleaned : s.original}
              s={s}
              actions={
                <DownloadButton
                  label="Download cleaned audio"
                  busy={s.exporting === "cleaned"}
                  disabled={!s.cleaned || s.exporting !== null}
                  onClick={() => void s.download("cleaned")}
                />
              }
            >
              <Segmented
                label="Listen to"
                value={track === "cleaned" ? "after" : "before"}
                onChange={(id) => listenTo(id === "after")}
                options={[
                  { id: "before", label: "Before" },
                  { id: "after", label: "After", disabled: !s.cleaned },
                ]}
              />
            </Transport>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── 03 Augment & Effects ───────────────────────────────────────────── */

function Module(p: { title: string; children: ReactNode }) {
  return (
    <div className="panel p-5">
      <p className="label-caps mb-4">{p.title}</p>
      {p.children}
    </div>
  );
}

function Augment({ s }: { s: StudioState }) {
  const [hearLive, setHearLive] = useState(true);
  const v = s.settings;
  const track: TrackId = hearLive ? "augmented" : s.selectedSource;
  const buffer = hearLive ? (s.liveAudio?.main ?? null) : s.augSource;

  /** Switch between dry and augmented; if this section is playing, carry on from the same moment. */
  const listenTo = (live: boolean) => {
    setHearLive(live);
    const next: TrackId = live ? "augmented" : s.selectedSource;
    const mine = s.transport.track === "augmented" || s.transport.track === s.selectedSource;
    if (s.transport.playing && mine && s.transport.track !== next) s.toggle(next);
  };

  return (
    <section aria-labelledby="augment-title">
      <SectionHead
        id="augment-title"
        number="03"
        title="Augment & Effects"
        blurb="Shape the voice and hear every change live."
        status={s.augStatus}
      >
        <Segmented
          label="Audio to augment"
          value={s.selectedSource}
          onChange={s.setSelectedSource}
          options={[
            { id: "original", label: "Original", disabled: !s.original },
            { id: "cleaned", label: "Cleaned", disabled: !s.cleaned },
          ]}
        />
      </SectionHead>

      <div className="panel p-5">
        {/* <WaveBlock
          label={s.augFresh ? "Rendered result" : "Preview"}
          note={s.augFresh ? "" : "Press play: controls change the sound as you move them"}
        > */}
          <Waveform
            buffer={s.augmented?.buffer ?? s.augSource}
            dimmed={!s.augFresh}
            active={s.transport.track === "augmented"}
            getPosition={s.getPosition}
            onSeek={(t) => s.seek("augmented", t)}
          />


        <div className="no-scrollbar -mx-1 mt-4 flex items-center gap-2 overflow-x-auto px-1 pb-1">
          <span className="label-caps shrink-0 pr-1">Presets</span>
          {Object.keys(PRESETS).map((name) => (
            <button
              key={name}
              onClick={() => s.applyPreset(name)}
              className="h-9 shrink-0 rounded-full border border-border px-4 text-[13px] transition hover:border-primary hover:text-primary active:scale-[0.97]"
            >
              {name}
            </button>
          ))}
          <button
            onClick={s.resetAugmentation}
            className="h-9 shrink-0 rounded-full px-3 text-[13px] text-muted-foreground transition hover:text-foreground"
          >
            Reset
          </button>
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <Transport
            label={hearLive ? "augmented audio" : "dry audio"}
            track={track}
            buffer={buffer}
            s={s}
            actions={
              <DownloadButton
                label="Download augmented audio"
                busy={s.exporting === "augmented"}
                disabled={!s.augSource || s.augBusy || s.exporting !== null}
                onClick={() => void s.download("augmented")}
              />
            }
          >
            <Segmented
              label="Listen to"
              value={hearLive ? "live" : "dry"}
              onChange={(id) => listenTo(id === "live")}
              options={[
                { id: "dry", label: "Original" },
                { id: "live", label: "Augmented" },
              ]}
            />
          </Transport>
        </div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Module title="Tone · 10-band equaliser">
          <div className="grid grid-cols-10 gap-0.5 sm:gap-2">
            {EQ_BANDS.map((band) => (
              <EqFader
                key={band.key}
                label={band.freq >= 1000 ? `${band.freq / 1000}k` : String(band.freq)}
                title={band.label.split(" : ")[1] ?? band.label}
                value={v[band.key]}
                onChange={(value) => s.set(band.key, value)}
              />
            ))}
          </div>
        </Module>

        <Module title="Voice">
          <div className="grid gap-4">
            <Dial
              label="Pitch"
              value={v.pitch}
              min={-12}
              max={12}
              step={0.2}
              unit=" st"
              onChange={(x) => s.set("pitch", x)}
            />
            <Dial
              label="Harmony"
              value={v.harmonizer}
              min={0}
              max={1}
              onChange={(x) => s.set("harmonizer", x)}
            />
            <Dial
              label="Harmony interval"
              value={v.harmonizerInterval}
              min={-10}
              max={10}
              step={0.1}
              unit=" st"
              onChange={(x) => s.set("harmonizerInterval", x)}
            />
            <Dial
              label="Chorus"
              value={v.chorus}
              min={0}
              max={1}
              onChange={(x) => s.set("chorus", x)}
            />
          </div>
        </Module>

        <Module title="Dynamics">
          <div className="grid gap-4">
            <Dial
              label="Compressor"
              value={v.compressor}
              min={0}
              max={1}
              onChange={(x) => s.set("compressor", x)}
            />
            <Dial
              label="Warmth"
              value={v.saturation}
              min={0}
              max={1}
              onChange={(x) => s.set("saturation", x)}
            />
            <Dial
              label="Output"
              value={v.output}
              min={-12}
              max={12}
              step={0.5}
              unit=" dB"
              onChange={(x) => s.set("output", x)}
            />
          </div>
        </Module>

        <Module title="Space">
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-x-6">
            <Dial
              label="Reverb"
              value={v.reverb}
              min={0}
              max={1}
              onChange={(x) => s.set("reverb", x)}
            />
            <Dial
              label="Room size"
              value={v.reverbSize}
              min={0.1}
              max={6}
              step={0.1}
              unit=" s"
              onChange={(x) => s.set("reverbSize", x)}
            />
            <Dial
              label="Echo"
              value={v.delay}
              min={0}
              max={1}
              onChange={(x) => s.set("delay", x)}
            />
            <Dial
              label="Echo time"
              value={v.delayTime}
              min={0.02}
              max={1.5}
              unit=" s"
              onChange={(x) => s.set("delayTime", x)}
            />
            <Dial
              label="Echo repeats"
              value={v.delayFeedback}
              min={0}
              max={1}
              step={0.1}
              onChange={(x) => s.set("delayFeedback", x)}
            />
          </div>
        </Module>
      </div>
    </section>
  );
}
