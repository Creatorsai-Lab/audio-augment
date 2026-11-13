import { useEffect, useRef, type PointerEvent } from "react";

type Props = {
  buffer: AudioBuffer | null;
  color: string;
  /** Whether the transport's playhead belongs to this track right now. */
  active: boolean;
  /** Fade the waveform, e.g. when it no longer matches the current settings. */
  dimmed?: boolean;
  /** Current playhead in seconds. Read every animation frame, so keep it stable. */
  getPosition: () => number;
  onSeek: (seconds: number) => void;
};

function drawWave(canvas: HTMLCanvasElement, buffer: AudioBuffer | null, color: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = (canvas.width = canvas.clientWidth * 2);
  const h = (canvas.height = canvas.clientHeight * 2);
  ctx.clearRect(0, 0, w, h);
  if (!buffer || w === 0) return;
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

const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Waveform with a playhead; click or drag to seek. */
export function Waveform({ buffer, color, active, dimmed = false, getPosition, onSeek }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);

  // Draw, and redraw whenever the element changes size.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    const draw = () => drawWave(canvas, buffer, color);
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
  }, [buffer, color]);

  // Playhead and clock are moved imperatively so playback never re-renders React.
  useEffect(() => {
    const head = headRef.current;
    const time = timeRef.current;
    if (!head || !time) return;
    const duration = buffer?.duration ?? 0;
    let frame = 0;
    const tick = () => {
      const pos = active ? Math.min(duration, getPosition()) : 0;
      head.style.left = `${duration > 0 ? (pos / duration) * 100 : 0}%`;
      head.style.opacity = active && duration > 0 ? "1" : "0";
      time.textContent = duration > 0 ? `${clock(pos)} / ${clock(duration)}` : "";
      if (active) frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [active, buffer, getPosition]);

  const seekTo = (e: PointerEvent<HTMLDivElement>) => {
    if (!buffer) return;
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width === 0) return;
    const fraction = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    onSeek(fraction * buffer.duration);
  };

  return (
    <div
      className={`relative h-17 w-full touch-none overflow-hidden rounded bg-secondary/60 ${buffer ? "cursor-pointer" : ""}`}
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
      <span
        ref={timeRef}
        className="pointer-events-none absolute bottom-0.5 right-1.5 font-mono text-[10px] text-muted-foreground"
      />
    </div>
  );
}
