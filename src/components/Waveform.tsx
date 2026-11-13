import { useEffect, useRef, type PointerEvent } from "react";

type Props = {
  buffer: AudioBuffer | null;
  /** Whether the transport's playhead belongs to this track right now. */
  active: boolean;
  /** Fade the waveform, e.g. when it no longer matches the current settings. */
  dimmed?: boolean;
  /** Show the "position / duration" readout in the corner. */
  clock?: boolean;
  /**
   * Current playhead in seconds, read every animation frame. Return NaN while
   * the playhead is not on this waveform to hide it.
   */
  getPosition: () => number;
  onSeek: (seconds: number) => void;
};

function drawWave(canvas: HTMLCanvasElement, buffer: AudioBuffer | null) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = (canvas.width = canvas.clientWidth * 2);
  const h = (canvas.height = canvas.clientHeight * 2);
  ctx.clearRect(0, 0, w, h);
  if (!buffer || w === 0) return;
  const data = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / w));
  // Every waveform in the app is drawn in the theme's --ring colour.
  ctx.fillStyle = getComputedStyle(canvas).getPropertyValue("--ring").trim() || "#f88a5e";
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

const time = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Waveform with a playhead; click or drag to seek. */
export function Waveform({
  buffer,
  active,
  dimmed = false,
  clock = true,
  getPosition,
  onSeek,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);

  // Draw, and redraw whenever the element changes size.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    const draw = () => drawWave(canvas, buffer);
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
  }, [buffer]);

  // Playhead and clock are moved imperatively so playback never re-renders React.
  useEffect(() => {
    const head = headRef.current;
    if (!head) return;
    const duration = buffer?.duration ?? 0;
    let frame = 0;
    const tick = () => {
      const raw = active ? getPosition() : 0;
      const here = Number.isFinite(raw);
      const pos = here ? Math.min(duration, Math.max(0, raw)) : 0;
      head.style.left = `${duration > 0 ? (pos / duration) * 100 : 0}%`;
      head.style.opacity = active && here && duration > 0 ? "1" : "0";
      if (timeRef.current) {
        timeRef.current.textContent = duration > 0 ? `${time(pos)} / ${time(duration)}` : "";
      }
      if (active) frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [active, buffer, getPosition, clock]);

  const seekTo = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (!buffer || box.width === 0) return;
    const fraction = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    onSeek(fraction * buffer.duration);
  };

  return (
    <div
      className={`relative h-20 w-full touch-none overflow-hidden rounded-md bg-muted/60 ${buffer ? "cursor-pointer" : ""}`}
      title={buffer ? "Click or drag to seek" : undefined}
      onPointerDown={(e) => {
        if (!buffer) return;
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        seekTo(e);
      }}
      onPointerMove={(e) => {
        if (dragging.current) seekTo(e);
      }}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      <canvas
        ref={canvasRef}
        className={`h-full w-full transition-opacity ${dimmed ? "opacity-35" : ""}`}
      />
      <div
        ref={headRef}
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-foreground opacity-0"
      />
      {clock && (
        <span
          ref={timeRef}
          className="pointer-events-none absolute bottom-0.5 right-1.5 font-mono text-[10px] text-muted-foreground"
        />
      )}
    </div>
  );
}
