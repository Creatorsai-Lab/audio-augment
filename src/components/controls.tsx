// Small hand-built controls shared across the studio.
import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

/* ── Icons: one 24px grid, one stroke weight ── */

const STROKES = {
  plus: "M12 5v14M5 12h14",
  copy: "M9 9h10v10H9zM5 15V5h10",
  trash: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13",
  undo: "M8 8 4 12l4 4M4 12h11a5 5 0 0 1 0 10h-3",
  redo: "M16 8l4 4-4 4M20 12H9a5 5 0 0 0 0 10h3",
  speed: "M12 9v4.5l3 1.5M9.5 2.5h5M12 22a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z",
  download: "M12 4v11M7 11l5 5 5-5M5 20h14",
  upload: "M12 16V5M7 9l5-5 5 5M5 20h14",
  arrowDown: "M12 5v14M6 13l6 6 6-6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  external: "M8 16 16 8M9.5 8H16v6.5",
} as const;

const FILLS = {
  play: "M8 5.2v13.6a.6.6 0 0 0 .9.5l11-6.8a.6.6 0 0 0 0-1L8.9 4.7a.6.6 0 0 0-.9.5z",
  pause: "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z",
} as const;

export type IconName = keyof typeof STROKES | keyof typeof FILLS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const filled = name in FILLS;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d={filled ? FILLS[name as keyof typeof FILLS] : STROKES[name as keyof typeof STROKES]}
      />
    </svg>
  );
}

/** GitHub's mark. */
export function GitHubMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/* ── Segmented control ── */

type Option<T extends string> = { id: T; label: ReactNode; disabled?: boolean };

export function Segmented<T extends string>(p: {
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={p.label}
      className={`inline-flex rounded-xl bg-muted p-1 ${p.className ?? ""}`}
    >
      {p.options.map((o) => {
        const on = o.id === p.value;
        return (
          <button
            key={o.id}
            role="radio"
            aria-checked={on}
            disabled={o.disabled}
            onClick={() => p.onChange(o.id)}
            className={`h-8 flex-1 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition disabled:opacity-35 ${
              on ? "bg-card text-ring shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Horizontal slider with a live readout ── */

export function Dial(p: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  /** Called when the user lets go, for changes that are too heavy to apply while dragging. */
  onCommit?: () => void;
}) {
  const step = p.step ?? 0.01;
  const digits = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  const pct = ((p.value - p.min) / (p.max - p.min)) * 100;
  return (
    <label className="block select-none">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-muted-foreground">{p.label}</span>
        <span className="font-mono text-xs tabular-nums">
          {p.value.toFixed(digits)}
          <span className="text-muted-foreground">{p.unit}</span>
        </span>
      </span>
      <input
        type="range"
        min={p.min}
        max={p.max}
        step={step}
        value={p.value}
        onChange={(e) => p.onChange(parseFloat(e.target.value))}
        onPointerUp={p.onCommit}
        onKeyUp={p.onCommit}
        className="slider"
        style={{ ["--pct" as string]: `${pct}%` }}
      />
    </label>
  );
}

/* ── Vertical EQ fader, ±12 dB around a centre line ── */

const EQ_RANGE = 12;

export function EqFader(p: {
  label: string;
  title: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const setFrom = (e: PointerEvent<HTMLDivElement>) => {
    const box = trackRef.current?.getBoundingClientRect();
    if (!box || box.height === 0) return;
    const fraction = Math.min(1, Math.max(0, (e.clientY - box.top) / box.height));
    p.onChange(Math.round(EQ_RANGE - fraction * 2 * EQ_RANGE));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    p.onChange(Math.min(EQ_RANGE, Math.max(-EQ_RANGE, p.value + delta)));
  };

  // 0 dB sits in the middle; the fill grows from there towards the thumb.
  const thumb = 50 - (p.value / EQ_RANGE) * 50;
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      <span
        className={`font-mono text-[10px] tabular-nums ${p.value === 0 ? "text-muted-foreground" : "text-primary"}`}
      >
        {p.value > 0 ? `+${p.value}` : p.value}
      </span>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={`${p.title} gain`}
        aria-valuemin={-EQ_RANGE}
        aria-valuemax={EQ_RANGE}
        aria-valuenow={p.value}
        title={`${p.title} · double-click to reset`}
        onKeyDown={onKey}
        onDoubleClick={() => p.onChange(0)}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          setFrom(e);
        }}
        onPointerMove={(e) => {
          if (dragging.current) setFrom(e);
        }}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        className="relative h-36 w-full cursor-ns-resize touch-none rounded-lg"
      >
        <div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-full bg-secondary" />
        <div className="absolute left-1/2 top-1/2 h-px w-3.5 -translate-x-1/2 bg-muted-foreground/60" />
        <div
          className="absolute left-1/2 w-1 -translate-x-1/2 rounded-full bg-primary"
          style={{ top: `${Math.min(thumb, 50)}%`, height: `${Math.abs(50 - thumb)}%` }}
        />
        <div
          className="absolute left-1/2 h-2.5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-[4px] bg-foreground shadow-[0_0_0_3px_var(--card)]"
          style={{ top: `${thumb}%` }}
        />
      </div>
      <span className="font-mono text-[10px] text-muted-foreground">{p.label}</span>
    </div>
  );
}
