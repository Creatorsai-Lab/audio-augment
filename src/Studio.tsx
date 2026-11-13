// The studio page. All behaviour comes from useStudio; this file is the
// interface: one stage on screen at a time, and a single transport docked at
// the bottom.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Timeline } from "./components/Timeline";
import { Waveform } from "./components/Waveform";
import { EQ_BANDS } from "./lib/audio/process";
import type { TrackId } from "./lib/audio/player";
import { PRESETS, useStudio, type StudioState } from "./useStudio";
import { button } from "./components/classes";
import { Dial, EqFader, GitHubMark, Icon, Segmented, type IconName } from "./components/controls";

type Stage = "arrange" | "clean" | "enhance";

const STAGES: readonly { id: Stage; number: string; title: string; blurb: string }[] = [
  { id: "arrange", number: "01", title: "Trim", blurb: "Trim, repeat, re-time and join clips." },
  {
    id: "clean",
    number: "02",
    title: "Remove Noise",
    blurb: "Take out noise, hiss, breaths and harsh S sounds.",
  },
  {
    id: "enhance",
    number: "03",
    title: "Augment & Effects",
    blurb: "Shape the voice and hear every change live.",
  },
];

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
  const [stage, setStage] = useState<Stage>("arrange");
  // What the transport plays in each stage.
  const [hearCleaned, setHearCleaned] = useState(false);
  const [hearLive, setHearLive] = useState(true);

  // Once noise removal finishes, the obvious next thing is to listen to it —
  // including when the "before" audio is already playing.
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

  const monitor: TrackId =
    stage === "arrange"
      ? "edit"
      : stage === "clean"
        ? hearCleaned && s.cleaned
          ? "cleaned"
          : "original"
        : hearLive
          ? "augmented"
          : s.selectedSource;

  const monitorBuffer =
    monitor === "edit"
      ? s.mix
      : monitor === "original"
        ? s.original
        : monitor === "cleaned"
          ? s.cleaned
          : (s.liveAudio?.main ?? null);

  const playing = s.transport.playing && s.transport.track === monitor;

  /** Switch what is heard; if something is playing it carries on from the same moment. */
  const listenTo = (track: TrackId) => {
    if (s.transport.playing && s.transport.track !== track) s.toggle(track);
  };

  const goTo = (next: Stage) => {
    if (next === stage) return;
    if (s.transport.playing) s.pause();
    // Leaving the timeline hands its result to the later stages.
    if (stage === "arrange" && !s.sent) s.sendToPipeline();
    setStage(next);
    window.scrollTo({ top: 0 });
  };

  const openFile = (file: File | undefined, mode: "replace" | "append") => {
    if (!file) return;
    if (mode === "replace") setStage("arrange");
    void s.loadFile(file, mode);
  };

  return (
    <div
      className="flex min-h-dvh flex-col"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        // The first file starts the project; later drops on the timeline add to it.
        if (s.tracks.length === 0) openFile(file, "replace");
        else if (stage === "arrange") openFile(file, "append");
      }}
    >
      <Header />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-48 pt-5 sm:px-6 sm:pb-36">
        <StageNav stage={stage} s={s} onStage={goTo} />
        <div key={stage} className="rise-in mt-6">
          {stage === "arrange" && (
            <Arrange
              s={s}
              onAdd={(f) => openFile(f, "append")}
              onNew={(f) => openFile(f, "replace")}
            />
          )}
          {stage === "clean" && <Clean s={s} />}
          {stage === "enhance" && <Enhance s={s} />}
        </div>
      </main>

      <Dock
        s={s}
        stage={stage}
        monitor={monitor}
        buffer={monitorBuffer}
        playing={playing}
        hearCleaned={hearCleaned}
        hearLive={hearLive}
        onHearCleaned={(on) => {
          setHearCleaned(on);
          listenTo(on ? "cleaned" : "original");
        }}
        onHearLive={(on) => {
          setHearLive(on);
          listenTo(on ? "augmented" : s.selectedSource);
        }}
        onStage={goTo}
      />
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

/* ── Upload zone (shown in the timeline until there is audio) ────────── */

// A fixed, hand-shaped envelope: decorative, and identical on every visit.
const BARS = Array.from({ length: 72 }, (_, i) => {
  const t = i / 71;
  const envelope = Math.sin(Math.PI * t) ** 0.7;
  const detail = 0.55 + 0.45 * Math.sin(i * 1.7) * Math.sin(i * 0.37 + 1);
  return Math.max(0.06, envelope * Math.abs(detail));
});

function UploadZone({
  status,
  onFile,
}: {
  status: string;
  onFile: (file: File | undefined) => void;
}) {
  return (
    <label className="group relative block cursor-pointer overflow-hidden rounded-xl border border-dashed border-border px-5 py-10 text-center transition hover:border-primary/70 sm:py-14">
      <div className="grid-paper pointer-events-none absolute inset-0" />
      <div className="relative">
        <div className="flex h-14 items-end justify-center gap-[3px]" aria-hidden="true">
          {BARS.map((h, i) => (
            <span
              key={i}
              className={`w-[3px] shrink-0 rounded-full bg-primary/80 group-hover:bg-primary ${i % 2 ? "hidden sm:block" : ""}`}
              style={{ height: `${h * 100}%`, opacity: 0.35 + h * 0.65 }}
            />
          ))}
        </div>
        <p className="mt-6 text-lg font-semibold tracking-tight sm:text-xl">
          Start with a <span className="serif-accent text-[1.3em]">recording</span>
        </p>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted-foreground">
          Everything runs on your device. Your audio is never uploaded.
        </p>
        <span className={`${button.primary} mt-6 w-full sm:w-auto`}>
          <Icon name="upload" /> Choose a recording
        </span>
        <p className="mt-3 text-[13px] text-muted-foreground" aria-live="polite">
          {status || "or drop a file anywhere · MP3 or WAV"}
        </p>
      </div>
      <input
        type="file"
        accept=".mp3,.wav,audio/*"
        className="sr-only"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </label>
  );
}

/* ── Stage navigation ───────────────────────────────────────────────── */

function StageNav({
  stage,
  s,
  onStage,
}: {
  stage: Stage;
  s: StudioState;
  onStage: (stage: Stage) => void;
}) {
  const done: Record<Stage, boolean> = {
    arrange: s.sent && s.original !== null,
    clean: s.cleaned !== null,
    enhance: s.augFresh,
  };
  return (
    <nav aria-label="Stages" className="grid grid-cols-3 gap-1.5 rounded-2xl bg-muted p-1.5">
      {STAGES.map((st) => {
        const on = st.id === stage;
        return (
          <button
            key={st.id}
            onClick={() => onStage(st.id)}
            aria-current={on ? "step" : undefined}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 py-2 transition sm:flex-row sm:justify-start sm:gap-2 sm:px-4 sm:py-2.5 ${
              on ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className={`font-mono text-[10px] sm:text-[11px] ${on ? "text-primary" : ""}`}>
              {st.number}
            </span>
            <span className="text-center text-[12px] font-medium leading-tight sm:text-sm">
              {st.title}
            </span>
            {done[st.id] && (
              <span className="ml-auto hidden text-done sm:block" title="Done">
                <Icon name="check" size={15} />
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function StageHead({
  stage,
  status,
  children,
}: {
  stage: Stage;
  status?: string;
  children?: ReactNode;
}) {
  const st = STAGES.find((x) => x.id === stage)!;
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h2 className="stage-title">{st.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{st.blurb}</p>
      </div>
      {children}
      {status && (
        <p className="w-full font-mono text-xs text-muted-foreground" aria-live="polite">
          {status}
        </p>
      )}
    </div>
  );
}

/* ── 01 Arrange ─────────────────────────────────────────────────────── */

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

function Arrange({
  s,
  onAdd,
  onNew,
}: {
  s: StudioState;
  onAdd: (file: File | undefined) => void;
  onNew: (file: File | undefined) => void;
}) {
  const [speedOpen, setSpeedOpen] = useState(false);
  // The slider moves freely; the stretch itself runs when it is released.
  const [draftSpeed, setDraftSpeed] = useState<number | null>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLInputElement>(null);
  const noTrack = s.activeTrack === null;
  const speed = draftSpeed ?? s.activeSpeed;

  const applySpeed = (value: number) => {
    setDraftSpeed(null);
    if (value !== s.activeSpeed) void s.changeSpeed(value);
  };

  return (
    <section>
      <StageHead stage="arrange" status={s.editStatus}>
        <button className={button.quiet} onClick={() => newRef.current?.click()}>
          <Icon name="refresh" size={16} /> New recording
        </button>
      </StageHead>
      <input
        ref={newRef}
        type="file"
        accept=".mp3,.wav,audio/*"
        className="sr-only"
        onChange={(e) => {
          onNew(e.target.files?.[0]);
          e.target.value = "";
        }}
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
        <div className="flex items-center gap-0.5 border-b border-border p-1.5">
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
            <UploadZone status={s.noiseStatus} onFile={onNew} />
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
      </div>

      <ul className="mt-4 grid gap-x-6 gap-y-1 text-[13px] text-muted-foreground sm:grid-cols-3">
        <li>
          <span className="font-mono text-trim">▌</span> Drag a clip&rsquo;s edge to trim
        </li>
        <li>Drag a clip to move it · edges snap together</li>
        <li>Tap the time scale to move the playhead</li>
      </ul>
    </section>
  );
}

/* ── 02 Clean ───────────────────────────────────────────────────────── */

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

function Clean({ s }: { s: StudioState }) {
  // The same line also carries the file description; only show it while it reports work.
  const working = / Hz · /.test(s.noiseStatus) ? "" : s.noiseStatus;
  const progress = s.noiseBusy ? percentIn(s.noiseStatus) : null;

  return (
    <section>
      <StageHead stage="clean" status={working} />
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
            {...(s.cleaned ? {} : { note: "Run Remove Noise to hear the difference" })}
          >
            <Waveform
              buffer={s.cleaned}
              active={s.transport.track === "cleaned"}
              getPosition={s.getPosition}
              onSeek={(t) => s.seek("cleaned", t)}
            />
          </WaveBlock>
        </div>
      </div>
    </section>
  );
}

/* ── 03 Enhance ─────────────────────────────────────────────────────── */

type Module = "tone" | "voice" | "dynamics" | "space";

function ModuleCard(p: { id: Module; open: Module; title: string; children: ReactNode }) {
  // Small screens show one module at a time; large screens show all four.
  return (
    <div className={`panel p-5 ${p.open === p.id ? "block" : "hidden"} lg:block`}>
      <p className="label-caps mb-4 hidden lg:block">{p.title}</p>
      {p.children}
    </div>
  );
}

function Enhance({ s }: { s: StudioState }) {
  const [module, setModule] = useState<Module>("tone");
  const v = s.settings;

  return (
    <section>
      <StageHead stage="enhance" status={s.augStatus}>
        <Segmented
          label="Audio to augment"
          value={s.selectedSource}
          onChange={s.setSelectedSource}
          options={[
            { id: "original", label: "Original", disabled: !s.original },
            { id: "cleaned", label: "Cleaned", disabled: !s.cleaned },
          ]}
        />
      </StageHead>

      <div className="panel p-5">
        <WaveBlock
          label={s.augFresh ? "Rendered result" : "Preview"}
          note={s.augFresh ? "" : "Press play: controls change the sound as you move them"}
        >
          <Waveform
            buffer={s.augmented?.buffer ?? s.augSource}
            dimmed={!s.augFresh}
            active={s.transport.track === "augmented"}
            getPosition={s.getPosition}
            onSeek={(t) => s.seek("augmented", t)}
          />
        </WaveBlock>

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
      </div>

      <Segmented
        label="Controls"
        className="mt-5 flex w-full lg:hidden"
        value={module}
        onChange={setModule}
        options={[
          { id: "tone", label: "Tone" },
          { id: "voice", label: "Voice" },
          { id: "dynamics", label: "Dynamics" },
          { id: "space", label: "Space" },
        ]}
      />

      <div className="mt-3 grid gap-5 lg:mt-5 lg:grid-cols-2">
        <ModuleCard id="tone" open={module} title="Tone · 10-band equaliser">
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
        </ModuleCard>

        <ModuleCard id="voice" open={module} title="Voice">
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
        </ModuleCard>

        <ModuleCard id="dynamics" open={module} title="Dynamics">
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
        </ModuleCard>

        <ModuleCard id="space" open={module} title="Space">
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
        </ModuleCard>
      </div>
    </section>
  );
}

/* ── Transport dock ─────────────────────────────────────────────────── */

function Dock(p: {
  s: StudioState;
  stage: Stage;
  monitor: TrackId;
  buffer: AudioBuffer | null;
  playing: boolean;
  hearCleaned: boolean;
  hearLive: boolean;
  onHearCleaned: (on: boolean) => void;
  onHearLive: (on: boolean) => void;
  onStage: (stage: Stage) => void;
}) {
  const { s, stage, monitor, buffer } = p;
  const timeRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const { getPosition } = s;
  const active = s.transport.track === monitor;
  const duration = buffer?.duration ?? 0;

  // Readout and progress line are written straight to the DOM every frame.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const pos = active ? Math.min(duration, getPosition()) : 0;
      if (timeRef.current) timeRef.current.textContent = clock(pos);
      if (barRef.current)
        barRef.current.style.width = `${duration > 0 ? (pos / duration) * 100 : 0}%`;
      if (active) frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [active, duration, getPosition]);

  const exportKind = stage === "arrange" ? "edited" : stage === "clean" ? "cleaned" : "augmented";
  const canExport =
    s.exporting === null &&
    (stage === "arrange"
      ? s.mix !== null
      : stage === "clean"
        ? s.cleaned !== null
        : s.augSource !== null && !s.augBusy);
  const exportLabel = s.exporting !== null ? "Exporting…" : "Export MP3";

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
      <div className="h-0.5 bg-transparent">
        <div ref={barRef} className="h-full bg-primary" style={{ width: 0 }} />
      </div>
      <div
        className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={() => s.toggle(monitor)}
          disabled={!buffer}
          aria-label={p.playing ? "Pause" : "Play"}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition active:scale-95 disabled:opacity-30"
        >
          <Icon name={p.playing ? "pause" : "play"} size={22} />
        </button>

        <div className="min-w-[5.5rem] font-mono text-sm tabular-nums leading-tight">
          <span ref={timeRef}>0:00.0</span>
          <span className="block text-[11px] text-muted-foreground">of {clock(duration)}</span>
        </div>

        {stage === "arrange" && <span className="label-caps hidden sm:block">Timeline mix</span>}
        {stage === "clean" && (
          <Segmented
            label="Listen to"
            value={p.hearCleaned && s.cleaned ? "after" : "before"}
            onChange={(id) => p.onHearCleaned(id === "after")}
            options={[
              { id: "before", label: "Before" },
              { id: "after", label: "After", disabled: !s.cleaned },
            ]}
          />
        )}
        {stage === "enhance" && (
          <Segmented
            label="Listen to"
            value={p.hearLive ? "live" : "dry"}
            onChange={(id) => p.onHearLive(id === "live")}
            options={[
              { id: "dry", label: "Dry" },
              { id: "live", label: "Augmented" },
            ]}
          />
        )}

        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          {stage === "enhance" ? (
            <button
              className={`${button.primary} flex-1 sm:flex-none`}
              disabled={!canExport}
              onClick={() => void s.download("augmented")}
            >
              <Icon name="download" /> {exportLabel}
            </button>
          ) : (
            <>
              <button
                className={`${button.quiet} h-11`}
                disabled={!canExport}
                onClick={() => void s.download(exportKind)}
                title={
                  stage === "arrange"
                    ? "Export the timeline as MP3"
                    : "Export the cleaned audio as MP3"
                }
              >
                <Icon name="download" /> <span>{exportLabel}</span>
              </button>
              <button
                className={`${button.primary} flex-1 sm:flex-none`}
                disabled={stage === "arrange" && s.mix === null}
                onClick={() => p.onStage(stage === "arrange" ? "clean" : "enhance")}
              >
                Continue <Icon name="arrow" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
