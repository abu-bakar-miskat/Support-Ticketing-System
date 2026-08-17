export function StatTile({ label, value, sub, color, display }: {
  label: string; value: number; sub: string; color: string;
  // Optional formatted rendering of `value` (e.g. "3h 20m"); `value` still
  // drives the zero-state styling.
  display?: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-l-2 py-0.5 pl-3.5" style={{ borderColor: value > 0 ? color : "var(--pen-card-border)" }}>
      <span className="pen-text-label">{label}</span>
      <span
        className="font-mono text-[27px] font-bold leading-none tabular-nums tracking-tight"
        style={{ color: value > 0 ? color : "var(--pen-subtle, #64748b)" }}
      >
        {display ?? value}
      </span>
      <span className="font-sans text-[11px] leading-tight text-pen-subtle">{sub}</span>
    </div>
  );
}
