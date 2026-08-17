"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

type SlaMetric = {
  status: "ON_TRACK" | "AT_RISK" | "BREACHED"
  elapsedMs: number
  targetMs: number
  remainingMs: number
}

type SlaIndicator = {
  firstResponse: SlaMetric
  resolution: SlaMetric
  overall: "ON_TRACK" | "AT_RISK" | "BREACHED"
}

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

  useEffect(() => {
    let cancelled = false
    fetch(`/api/tickets/${ticketId}/sla`)
      .then((res) => (res.ok ? res.json() : { indicator: null }))
      .then((data) => {
        if (!cancelled) setIndicator(data.indicator ?? null)
      })
      .catch(() => {
        if (!cancelled) setIndicator(null)
      })
    return () => {
      cancelled = true
    }
  }, [ticketId])

  if (!indicator) return null

  const style = STATUS_STYLE[indicator.overall]
  // The tighter of the two live (not-yet-stopped) metrics drives the displayed time.
  const activeMetric =
    indicator.firstResponse.status === indicator.overall ? indicator.firstResponse : indicator.resolution
  const timeLabel =
    activeMetric.remainingMs >= 0
      ? `${formatDuration(activeMetric.remainingMs)} left`
      : `${formatDuration(activeMetric.remainingMs)} overdue`

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
