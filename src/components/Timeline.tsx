import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { timelineEnd, type Track } from "../lib/audio/edit";
import type { TrackId } from "../lib/audio/player";

/** The editable part of a track: kept span and timeline position, in samples. */
export type Placement = Pick<Track, "start" | "end" | "at">;

/** Shortest span a track can be trimmed down to. */
const MIN_SECONDS = 0.05;
/** How close (in pixels) a dragged clip must come to an edge to snap onto it. */
const SNAP_PIXELS = 8;

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
      // Browsers cap canvas size, and a long clip at this zoom can exceed it.
      const w = (canvas.width = Math.min(canvas.clientWidth * 2, 16000));
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

  const bar = "z-10 w-2 shrink-0 cursor-ew-resize touch-none bg-trim [@media(pointer:coarse)]:w-4";
  const labelAt = drag ? (drag.mode === "end" ? at + end - start : at) : 0;

  return (
    <div
      ref={laneRef}
      className="relative h-20 touch-pan-x rounded-md bg-muted/60"
      onPointerDown={(e) => {
        // Empty lane space moves the playhead.
        const box = e.currentTarget.getBoundingClientRect();
        if (box.width > 0) onSeek((((e.clientX - box.left) / box.width) * view) / rate);
      }}
    >
      <div
        className={`absolute inset-y-2 flex overflow-hidden rounded-md bg-background shadow-sm ${highlighted ? "ring-2 ring-trim" : "ring-1 ring-border"}`}
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
            {track.speed !== 1 && ` · ${track.speed}×`}
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

/** Fixed zoom of the timeline: one labelled 10-second division is this many pixels wide. */
const PIXELS_PER_SECOND = 16;
const DIVISION_SECONDS = 10;
/** Empty timeline kept after the last clip, so there is always room to drag into. */
const SPARE_SECONDS = 10;

type TimelineProps = {
  tracks: readonly Track[];
  activeId: number | null;
  transport: { track: TrackId | null; playing: boolean };
  /** Playhead of the timeline, in seconds. */
  getPosition: () => number;
  onActivate: (id: number) => void;
  /** Move the timeline playhead. */
  onSeek: (seconds: number) => void;
  /** Trim or slide a track. */
  onChange: (id: number, placement: Placement) => void;
  /** Element that receives the "position / total" text every frame. */
  readout?: RefObject<HTMLSpanElement | null>;
};

/**
 * The timeline itself: time scale, one lane per track and the main playhead,
 * scrolling sideways at a fixed zoom. Has no buttons, so any page can frame it.
 */
export function Timeline(p: TimelineProps) {
  const { getPosition, readout } = p;
  const rate = p.tracks[0]?.buffer.sampleRate ?? 48000;
  const total = timelineEnd(p.tracks);
  const totalSeconds = total / rate;
  const previewing = p.transport.track === "edit";
  const playing = previewing && p.transport.playing;

  const scrollRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);

  // The scale never stretches: the timeline is as long as its content (plus
  // spare room), or the visible width if that is longer, and scrolls sideways.
  const [visibleWidth, setVisibleWidth] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setVisibleWidth(el.clientWidth));
    observer.observe(el);
    setVisibleWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);
  const viewSeconds = Math.max(totalSeconds + SPARE_SECONDS, visibleWidth / PIXELS_PER_SECOND);
  const view = viewSeconds * rate;

  // One playhead for the whole timeline, moved imperatively so playback never re-renders React.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const pos = previewing ? Math.min(totalSeconds, getPosition()) : 0;
      if (headRef.current) headRef.current.style.left = `${pos * PIXELS_PER_SECOND}px`;
      if (readout?.current) {
        readout.current.textContent = `${clock(pos, 1)} / ${clock(totalSeconds, 1)}`;
      }
      // Keep the playhead in sight while it plays through a long timeline.
      const scroller = scrollRef.current;
      if (playing && scroller) {
        const x = pos * PIXELS_PER_SECOND;
        if (x < scroller.scrollLeft || x > scroller.scrollLeft + scroller.clientWidth - 40) {
          scroller.scrollLeft = Math.max(0, x - 40);
        }
      }
      if (previewing) frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [previewing, playing, getPosition, totalSeconds, readout]);

  const divisions: number[] = [];
  for (let t = 0; t <= viewSeconds; t += DIVISION_SECONDS) divisions.push(t);

  const scrubbing = useRef(false);
  const seekFromRuler = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    p.onSeek(Math.max(0, (e.clientX - box.left) / PIXELS_PER_SECOND));
  };

  return (
    <div ref={scrollRef} className="overflow-x-auto pb-2">
      <div className="relative" style={{ width: `${viewSeconds * PIXELS_PER_SECOND}px` }}>
        {/* Time scale: a label every 10 seconds, a small tick every second.
            Click or drag on it to move the playhead. */}
        <div
          className="relative mb-1.5 h-6 cursor-pointer touch-none select-none border-b border-border font-mono text-[10px] text-muted-foreground"
          title="Click or drag to move the playhead"
          style={{
            backgroundImage: "linear-gradient(to right, var(--border) 1px, transparent 1px)",
            backgroundSize: `${PIXELS_PER_SECOND}px 5px`,
            backgroundRepeat: "repeat-x",
            backgroundPosition: "left bottom",
          }}
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
          {divisions.map((t) => (
            <span
              key={t}
              className="pointer-events-none absolute bottom-0 flex h-full items-end border-l border-muted-foreground/60 pb-1 pl-1 leading-none"
              style={{ left: `${t * PIXELS_PER_SECOND}px` }}
            >
              {clock(t)}
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
    </div>
  );
}
