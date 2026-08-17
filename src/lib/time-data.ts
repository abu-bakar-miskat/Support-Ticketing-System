import "server-only"

/** Monday 00:00 local time for the week containing `now`, plus exclusive end. */
export function getWeekBounds(now: Date): { weekStart: Date; weekEnd: Date } {
  const mondayOffset = (now.getDay() + 6) % 7
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 7)
  return { weekStart, weekEnd }
}

export function entrySeconds(
  entry: { startedAt: Date; endedAt: Date | null; durationSecs: number | null },
  now: Date,
): number {
  if (entry.durationSecs != null) return entry.durationSecs
  const end = entry.endedAt ?? now
  return Math.max(0, Math.floor((end.getTime() - entry.startedAt.getTime()) / 1000))
}

/** "5h 42m" / "4h" / "25m" / "0m" */
export function formatHm(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, "0")}m`
}

/** "1:24:36" — hours unpadded */
export function formatHms(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = Math.floor(totalSecs % 60)
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

/** "01:24:36" — fully padded, for the big timer readout */
export function formatClock(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = Math.floor(totalSecs % 60)
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

/** "11:20" */
export function formatTimeOfDay(date: Date): string {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })
}

/** "Jun 2 – Jun 8" */
export function formatDateRange(start: Date, end: Date): string {
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  return `${fmt(start)} – ${fmt(end)}`
}

/** "Now"-style relative label: "5m ago", "2h ago", "3d ago" */
export function relativeAgo(date: Date, now: Date): string {
  const mins = Math.floor((now.getTime() - date.getTime()) / 60_000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
