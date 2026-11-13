import { useEffect, useRef, useState, type PointerEvent } from "react";
import { timelineEnd, type Track } from "../lib/audio/edit";
import type { TrackId } from "../lib/audio/player";

/** The editable part of a track: kept span and timeline position, in samples. */
export type Placement = Pick<Track, "start" | "end" | "at">;

type Props = {
  tracks: readonly Track[];
  activeId: number | null;
  transport: { track: TrackId | null; playing: boolean };
  status: string;
  busy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** Playhead of the timeline, in seconds. */
  getPosition: () => number;
  onActivate: (id: number) => void;
  /** Move the timeline playhead. */
  onSeek: (seconds: number) => void;
  /** Trim or slide a track. */
  onChange: (id: number, placement: Placement) => void;
  /** Play / pause the whole timeline. */
  onPreview: () => void;
  onDuplicate: () => void;
  /** Remove the highlighted track. */
  onRemove: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onAdd: (file: File) => void;
  onDownload: () => void;
};

/** Shortest span a track can be trimmed down to. */
const MIN_SECONDS = 0.05;
/** How close (in pixels) a dragged clip must come to an edge to snap onto it. */
const SNAP_PIXELS = 8;

const side =
  "flex h-9 w-9 items-center justify-center rounded-md border border-border text-lg transition-all duration-150 hover:bg-secondary active:translate-y-0.5 disabled:opacity-40";

const clock = (seconds: number, decimals = 0) => {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(decimals).padStart(decimals ? decimals + 3 : 2, "0")}`;
};

/** The kept span of a file as a waveform, in the theme's primary colour. */
function ClipWave({ buffer, start, end }: { buffer: AudioBuffer; start: number; end: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let frame = 0;
    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const w = (canvas.width = canvas.clientWidth * 2);
      const h = (canvas.height = canvas.clientHeight * 2);
      ctx.clearRect(0, 0, w, h);
      if (w === 0) return;
      const data = buffer.getChannelData(0);
      const perPixel = (end - start) / w;
      // Look at a bounded number of samples per column so redrawing while a
      // trim bar is dragged stays instant even for very long files.
      const stride = Math.max(1, Math.floor(perPixel / 48));
      ctx.fillStyle = getComputedStyle(canvas).getPropertyValue("--primary").trim() || "#c75d3a";
      for (let x = 0; x < w; x++) {
        const from = start + Math.floor(x * perPixel);
        const to = Math.max(from + 1, start + Math.floor((x + 1) * perPixel));
        let min = 1;
        let max = -1;
        for (let i = from; i < to; i += stride) {
          const v = data[i] ?? 0;
          if (v < min) min = v;
          if (v > max) max = v;
        }
        ctx.fillRect(x, ((1 + min) * h) / 2, 1, Math.max(2, ((max - min) * h) / 2));
      }
    };
    draw();
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [buffer, start, end]);

  return <canvas ref={ref} className="h-full w-full" />;
}

type LaneProps = {
  track: Track;
  /** Length of the visible timeline, in samples. */
  view: number;
  /** Timeline positions (samples) a dragged clip snaps to: other clips' edges. */
  snapPoints: readonly number[];
  highlighted: boolean;
  onActivate: (id: number) => void;
  onChange: (id: number, placement: Placement) => void;
  onSeek: (seconds: number) => void;
};

type Drag = Placement & { mode: "start" | "end" | "move"; x: number; from: Placement };

function Lane({ track, view, snapPoints, highlighted, onActivate, onChange, onSeek }: LaneProps) {
  const rate = track.buffer.sampleRate;
  const laneRef = useRef<HTMLDivElement>(null);
  // While dragging, the new placement lives here; it is committed (one undo
  // step, one re-mix) when the pointer is released.
  const [drag, setDrag] = useState<Drag | null>(null);
  const { start, end, at } = drag ?? track;

  const handlers = (mode: Drag["mode"]) => ({
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      onActivate(track.id);
      const from = { start: track.start, end: track.end, at: track.at };
      setDrag({ ...from, mode, x: e.clientX, from });
      // Capture keeps the drag alive when the pointer leaves the element.
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      const width = laneRef.current?.getBoundingClientRect().width ?? 0;
      if (!drag || drag.mode !== mode || width === 0) return;
      const perPixel = view / width;
      const delta = Math.round((e.clientX - drag.x) * perPixel);
      const from = drag.from;
      const min = Math.round(MIN_SECONDS * rate);

      if (mode === "start") {
        // The audio stays where it is on the timeline; only its left edge moves.
        const lowest = Math.max(0, from.start - from.at);
        const next = Math.min(Math.max(from.start + delta, lowest), from.end - min);
        setDrag({ ...drag, start: next, at: from.at + next - from.start });
      } else if (mode === "end") {
        const next = Math.min(Math.max(from.end + delta, from.start + min), track.buffer.length);
        setDrag({ ...drag, end: next });
      } else {
        const length = from.end - from.start;
        let next = Math.max(0, from.at + delta);
        // Snap either edge onto the nearest neighbouring edge, so clips butt
        // together without a gap or an overlap.
        let nearest = SNAP_PIXELS * perPixel;
        for (const point of [0, ...snapPoints]) {
          for (const candidate of [point, point - length]) {
            const distance = Math.abs(from.at + delta - candidate);
            if (candidate >= 0 && distance < nearest) {
              nearest = distance;
              next = candidate;
            }
          }
        }
        setDrag({ ...drag, at: next });
      }
    },
    onPointerUp: () => {
      if (drag && (drag.start !== track.start || drag.end !== track.end || drag.at !== track.at)) {
        onChange(track.id, { start: drag.start, end: drag.end, at: drag.at });
      }
      setDrag(null);
    },
    onPointerCancel: () => setDrag(null),
  });

  const bar = "z-10 w-2 shrink-0 cursor-ew-resize touch-none bg-chart-4";
  const labelAt = drag ? (drag.mode === "end" ? at + end - start : at) : 0;

  return (
    <div
      ref={laneRef}
      className="relative h-20 touch-none rounded-md bg-muted/60"
      onPointerDown={(e) => {
        // Empty lane space moves the playhead.
        const box = e.currentTarget.getBoundingClientRect();
        if (box.width > 0) onSeek((((e.clientX - box.left) / box.width) * view) / rate);
      }}
    >
      <div
        className={`absolute inset-y-2 flex overflow-hidden rounded-md bg-background shadow-sm ${highlighted ? "ring-2 ring-primary" : "ring-1 ring-border"}`}
        style={{ left: `${(at / view) * 100}%`, width: `${((end - start) / view) * 100}%` }}
      >
        <div
          {...handlers("start")}
          className={bar}
          title="Drag to trim the start"
          aria-label="Trim start"
        />
        <div
          {...handlers("move")}
          className={`relative min-w-0 flex-1 touch-none ${drag?.mode === "move" ? "cursor-grabbing" : "cursor-grab"}`}
          title="Drag to move along the timeline"
        >
          <ClipWave buffer={track.buffer} start={start} end={end} />
          <span className="pointer-events-none absolute left-1.5 top-0.5 max-w-full truncate text-[10px] font-medium text-foreground/80">
            {track.name}
          </span>
        </div>
        <div
          {...handlers("end")}
          className={bar}
          title="Drag to trim the end"
          aria-label="Trim end"
        />
      </div>
      {drag && (
        <span
          className={`pointer-events-none absolute top-0 z-20 rounded bg-foreground px-1 font-mono text-[10px] text-background ${drag.mode === "end" ? "-translate-x-full" : ""}`}
          style={{ left: `${(labelAt / view) * 100}%` }}
        >
          {clock(labelAt / rate, 2)}
        </span>
      )}
    </div>
  );
}

/** Trim & join section: every track is a clip on its own lane of one shared timeline. */
export function Editor(p: Props) {
  const { getPosition } = p;
  const rate = p.tracks[0]?.buffer.sampleRate ?? 48000;
  const total = timelineEnd(p.tracks);
  // Leave some empty timeline after the last clip so there is room to drag into.
  const view = Math.max(total * 1.15, rate);
  const viewSeconds = view / rate;
  const totalSeconds = total / rate;
  const previewing = p.transport.track === "edit";
  const hasTracks = p.tracks.length > 0;

  const headRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);

  // One playhead for the whole timeline, moved imperatively so playback never re-renders React.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const pos = previewing ? Math.min(totalSeconds, getPosition()) : 0;
      if (headRef.current) headRef.current.style.left = `${(pos / viewSeconds) * 100}%`;
      if (timeRef.current) {
        timeRef.current.textContent = hasTracks
          ? `${clock(pos, 1)} / ${clock(totalSeconds, 1)}`
          : "";
      }
      if (previewing) frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [previewing, getPosition, viewSeconds, totalSeconds, hasTracks]);

  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
  const step = steps.find((s) => viewSeconds / s <= 12) ?? 3600;
  const ticks: number[] = [];
  for (let i = 0; i * step <= viewSeconds; i++) ticks.push(i * step);

  const scrubbing = useRef(false);
  const seekFromRuler = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width === 0) return;
    const fraction = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    p.onSeek(fraction * viewSeconds);
  };

  return (
    <section
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f) p.onAdd(f);
      }}
      className="mb-8 flex gap-4 rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-panel)]"
    >
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground">
            Trim &amp; Join
          </p>
          <span className="text-xs text-muted-foreground">
            {p.status ||
              (hasTracks
                ? `${p.tracks.length} track${p.tracks.length > 1 ? "s" : ""} · ${totalSeconds.toFixed(1)}s total`
                : "")}
          </span>
        </div>

        {!hasTracks ? (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Upload audio to trim it, repeat a part, or join several files.
          </p>
        ) : (
          <div className="relative">
            {/* Time scale; click or drag on it to move the playhead */}
            <div
              className="relative mb-1.5 h-6 cursor-pointer touch-none select-none border-b border-border font-mono text-[10px] text-muted-foreground"
              title="Click or drag to move the playhead"
              onPointerDown={(e) => {
                scrubbing.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                seekFromRuler(e);
              }}
              onPointerMove={(e) => {
                if (scrubbing.current) seekFromRuler(e);
              }}
              onPointerUp={() => (scrubbing.current = false)}
              onPointerCancel={() => (scrubbing.current = false)}
            >
              {ticks.map((t) => (
                <span
                  key={t}
                  className="pointer-events-none absolute bottom-0 flex h-full items-end border-l border-border pb-0.5 pl-1 leading-none"
                  style={{ left: `${(t / viewSeconds) * 100}%` }}
                >
                  {/* A label at the far right edge would spill out of the scale. */}
                  {t / viewSeconds < 0.96 ? clock(t, step < 1 ? 1 : 0) : ""}
                </span>
              ))}
            </div>

            <div className="grid gap-1.5">
              {p.tracks.map((track) => (
                <Lane
                  key={track.id}
                  track={track}
                  view={view}
                  snapPoints={p.tracks
                    .filter((t) => t.id !== track.id)
                    .flatMap((t) => [t.at, t.at + t.end - t.start])}
                  highlighted={track.id === p.activeId}
                  onActivate={p.onActivate}
                  onChange={p.onChange}
                  onSeek={p.onSeek}
                />
              ))}
            </div>

            {/* Main playhead across the scale and every lane */}
            <div
              ref={headRef}
              className="pointer-events-none absolute inset-y-0 z-30 w-0.5 -translate-x-1/2 bg-foreground"
            >
              <div className="absolute -left-[5px] top-0 h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-foreground" />
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-md border border-border px-4 py-2 text-sm transition-all duration-150 active:translate-y-1">
            + Add audio
            <input
              type="file"
              accept=".mp3,.wav,audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) p.onAdd(f);
                e.target.value = "";
              }}
            />
          </label>
          <button
            disabled={!hasTracks}
            onClick={p.onPreview}
            className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-40"
          >
            {previewing && p.transport.playing ? "⏸ Pause" : "▶ Play all tracks"}
          </button>
          <button
            disabled={!hasTracks || p.busy}
            onClick={p.onDownload}
            className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all duration-150 hover:opacity-80 active:translate-y-1 disabled:opacity-40"
          >
            {p.busy ? "Exporting…" : "⬇ Download combined audio"}
          </button>
          <span ref={timeRef} className="ml-1 font-mono text-xs text-muted-foreground" />
        </div>
      </div>

      {/* Thin action bar on the right edge */}
      <div className="flex flex-col items-center gap-2 border-l border-border pl-4">
        <button
          className={side}
          disabled={p.activeId === null}
          onClick={p.onDuplicate}
          title="Duplicate the highlighted track as a new row below it"
          aria-label="Duplicate track"
        >
          ⧉
        </button>
        <button
          className={side}
          disabled={p.activeId === null}
          onClick={p.onRemove}
          title="Remove the highlighted track"
          aria-label="Remove track"
        >
          ✕
        </button>
        <button
          className={side}
          disabled={!p.canUndo}
          onClick={p.onUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          ↶
        </button>
        <button
          className={side}
          disabled={!p.canRedo}
          onClick={p.onRedo}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
        >
          ↷
        </button>
      </div>
    </section>
  );
}
