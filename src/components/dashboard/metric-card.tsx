"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Shared briefing-band metric tile used by the manager and staff dashboards.
 * A coloured value with a label and sub-line; dims when the value is zero.
 * Becomes a button (onClick) or a link (href) when it has a value to act on.
 */
export function MetricCard({
  label,
  value,
  display,
  sub,
  color,
  active,
  onClick,
  href,
}: {
  label: string;
  value: number;
  /** Optional formatted value (e.g. a duration) shown instead of the raw number. */
  display?: string;
  sub: string;
  color: string;
  active?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const hasValue = value > 0;

  const body = (
    <>
      <span className="pen-text-label">{label}</span>
      <span
        className="font-mono text-[28px] font-bold leading-none tabular-nums tracking-tight"
        style={{ color: hasValue ? color : "var(--pen-subtle, #64748b)" }}
      >
        {display ?? value}
      </span>
      <span className="font-sans text-[11px] leading-tight text-pen-subtle">{sub}</span>
    </>
  );

  const className = cn(
    "flex flex-col gap-1.5 rounded-xl border px-4 py-3.5 text-left transition-all",
    hasValue ? "shadow-sm" : "opacity-80",
    active
      ? "ring-1 ring-offset-1 ring-offset-pen-bg"
      : (onClick || href) && hasValue
        ? "hover:border-pen-muted/50 hover:shadow-md"
        : "hover:border-pen-muted/50",
  );

  const style = {
    borderColor: active ? color : hasValue ? `${color}30` : "var(--pen-card-border)",
    backgroundColor: hasValue ? `${color}0a` : "var(--pen-card)",
    ...(active ? { ringColor: `${color}55` } : {}),
  } as React.CSSProperties;

  if (href && hasValue) {
    return (
      <Link href={href} className={className} style={style}>
        {body}
      </Link>
    );
  }
  if (onClick && hasValue) {
    return (
      <button type="button" onClick={onClick} className={className} style={style}>
        {body}
      </button>
    );
  }
  return (
    <div className={className} style={style}>
      {body}
    </div>
  );
}
