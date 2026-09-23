"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

type SlaMetric = {
  status: "ON_TRACK" | "AT_RISK" | "BREACHED"
  elapsedMs: number
  targetMs: number
  remainingMs: number
  /** Whether this metric's clock is counting right now (server truth at fetch time). */
  running: boolean
}

type SlaIndicator = {
  firstResponse: SlaMetric
  resolution: SlaMetric
  overall: "ON_TRACK" | "AT_RISK" | "BREACHED"
  /** Server instant the metrics were computed at; anchors the live countdown. */
  asOf: string
}

/** Re-render cadence for the live countdown. The label is minute-granular, so a
 * few seconds' lag is invisible; this only re-renders one tiny span. */
const TICK_MS = 15_000

const STATUS_STYLE: Record<SlaIndicator["overall"], { bg: string; text: string; label: string }> = {
  ON_TRACK: { bg: "bg-emerald-500/10 dark:bg-emerald-400/10", text: "text-emerald-700 dark:text-emerald-400", label: "On track" },
  AT_RISK: { bg: "bg-amber-500/10 dark:bg-amber-400/10", text: "text-amber-700 dark:text-amber-400", label: "At risk" },
  BREACHED: { bg: "bg-red-500/10 dark:bg-red-400/10", text: "text-red-700 dark:text-red-400", label: "Breached" },
}

function formatDuration(ms: number): string {
  const abs = Math.abs(ms)
  const mins = Math.round(abs / 60_000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  const remMins = mins % 60
  if (hours < 24) return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`
}

/** SLA-06: on-ticket indicator (ON_TRACK/AT_RISK/BREACHED) with remaining/overdue time. */
export function SlaIndicatorBadge({ ticketId, size = "sm" }: { ticketId: string; size?: "sm" | "md" }) {
  const [indicator, setIndicator] = useState<SlaIndicator | null | undefined>(undefined)
  // Client clock at the moment the current snapshot was received; the live
  // countdown measures elapsed time from here rather than trusting `asOf`
  // directly, so unsynced client/server clocks don't skew the number.
  const anchorRef = useRef(0)
  // Bumps to force a re-render so the interpolated time re-computes; value unused.
  const [, tick] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/tickets/${ticketId}/sla`)
      .then((res) => (res.ok ? res.json() : { indicator: null }))
      .then((data) => {
        if (!cancelled) {
          anchorRef.current = Date.now()
          setIndicator(data.indicator ?? null)
        }
      })
      .catch(() => {
        if (!cancelled) setIndicator(null)
      })
    return () => {
      cancelled = true
    }
  }, [ticketId])

  // Only tick while a metric's clock is actually moving; when everything is
  // stopped or paused (outside hours / waiting on customer) we render statically.
  const anyRunning = !!indicator && (indicator.firstResponse.running || indicator.resolution.running)
  useEffect(() => {
    if (!anyRunning) return
    const id = setInterval(() => tick((t) => t + 1), TICK_MS)
    return () => clearInterval(id)
  }, [anyRunning])

  if (!indicator) return null

  const style = STATUS_STYLE[indicator.overall]
  // The tighter of the two live (not-yet-stopped) metrics drives the displayed time.
  const activeMetric =
    indicator.firstResponse.status === indicator.overall ? indicator.firstResponse : indicator.resolution
  // Interpolate down from the snapshot only while this metric's clock is running.
  const elapsedSinceFetch = activeMetric.running ? Date.now() - anchorRef.current : 0
  const remainingMs = activeMetric.remainingMs - elapsedSinceFetch
  const timeLabel =
    remainingMs >= 0
      ? `${formatDuration(remainingMs)} left`
      : `${formatDuration(remainingMs)} overdue`

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-sans font-medium",
        "ring-1 ring-inset ring-black/4 dark:ring-white/10",
        style.bg,
        style.text,
        size === "sm" ? "px-1.5 py-0.5 text-[9.5px]" : "px-2 py-0.5 text-[11.5px]",
      )}
      title={`SLA: ${style.label} — first response ${indicator.firstResponse.status}, resolution ${indicator.resolution.status}`}
    >
      SLA: {style.label} · {timeLabel}
    </span>
  )
}
