import type { ReactNode } from "react";

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-panel)]">
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
        {title}
      </h2>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}
