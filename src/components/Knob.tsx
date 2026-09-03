type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
};

export function Knob({ label, value, min, max, step = 0.01, unit = "", onChange }: Props) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block select-none">
      <span className="flex items-baseline justify-between text-xs">
        <span className="uppercase tracking-widest text-muted-foreground">{label}</span>
        <span className="font-mono text-accent">
          {step >= 1 ? value.toFixed(0) : value.toFixed(2)}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="fader mt-2 w-full"
        style={{ ["--pct" as string]: `${pct}%` }}
      />
    </label>
  );
}
