import { formatCalendarDate } from "@/lib/ticket-datetime";

// Preset windows for the Team Reports date filter. "custom" is driven by
// explicit from/to params rather than a preset button.
export const PEOPLE_RANGE_PRESETS = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
] as const;

export type PeopleRangePreset = "7d" | "30d" | "custom";

export function isoDate(d: Date): string {
  return formatCalendarDate(d);
}

export type ResolvedPeopleRange = {
  preset: PeopleRangePreset;
  start: Date;
  /** Inclusive end-of-day for custom ranges; "now" for presets. */
  end: Date;
  from: string;
  to: string;
  /** Lowercase, sentence-safe: "last 7 days" | "last 30 days" | "1 Jan – 15 Jan 2026". */
  label: string;
};

function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Resolve the Team Reports date filter from URL params. Defaults to the last
 * 7 days when params are missing or invalid, preserving the page's original
 * behaviour.
 */
export function resolvePeopleRange(
  presetParam: string | undefined,
  from: string | undefined,
  to: string | undefined,
): ResolvedPeopleRange {
  const now = new Date();
  if (presetParam === "custom" && from && to) {
    return {
      preset: "custom",
      start: new Date(`${from}T00:00:00`),
      end: new Date(`${to}T23:59:59.999`),
      from,
      to,
      label: `${fmtDay(from)} – ${fmtDay(to)}`,
    };
  }
  const preset: PeopleRangePreset = presetParam === "30d" ? "30d" : "7d";
  const days = preset === "30d" ? 30 : 7;
  const start = new Date(now.getTime() - days * 86_400_000);
  return {
    preset,
    start,
    end: now,
    from: isoDate(start),
    to: isoDate(now),
    label: `last ${days} days`,
  };
}
