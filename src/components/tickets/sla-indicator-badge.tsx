"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import type { ManualResolutionView } from "@/lib/manual-resolution"
import { cn } from "@/lib/utils"

export type SlaMetric = {
  status: "ON_TRACK" | "AT_RISK" | "BREACHED"
  elapsedMs: number
  targetMs: number
  remainingMs: number
  /** Whether this metric's clock is counting right now (server truth at fetch time). */
  running: boolean
}

export type SlaIndicator = {
  source?: string
  completed?: boolean
  firstResponse: SlaMetric
  resolution: SlaMetric
  overall: "ON_TRACK" | "AT_RISK" | "BREACHED"
  /** Server instant the metrics were computed at; anchors the live countdown. */
  asOf: string
  /** Only sent to tenant admins and the department's admins/managers. */
  details?: {
    policyName: string | null
    firstResponseStartedAt: string
    firstResponseStoppedAt: string | null
    resolutionStartedAt: string | null
    resolutionStoppedAt: string | null
    breaches: { metric: "first_response" | "resolution"; targetMins: number; breachedAt: string }[]
  }
}

/** Re-render cadence for the live countdown. The label is minute-granular, so a
 * few seconds' lag is invisible; this only re-renders one tiny span. */
const TICK_MS = 15_000

export const STATUS_STYLE: Record<SlaIndicator["overall"], { bg: string; text: string; label: string }> = {
  ON_TRACK: { bg: "bg-emerald-500/10 dark:bg-emerald-400/10", text: "text-emerald-700 dark:text-emerald-400", label: "On track" },
  AT_RISK: { bg: "bg-amber-500/10 dark:bg-amber-400/10", text: "text-amber-700 dark:text-amber-400", label: "At risk" },
  BREACHED: { bg: "bg-red-500/10 dark:bg-red-400/10", text: "text-red-700 dark:text-red-400", label: "Breached" },
}

export function formatDuration(ms: number): string {
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

/**
 * Shared SLA fetch + live clock. Keyed on `refreshKey` so the header badge and
 * the sidebar details panel share one request per refresh.
 */
export function useSlaIndicator(ticketId: string, refreshKey?: number | string) {
  const { data, dataUpdatedAt } = useQuery({
    queryKey: ["tickets", ticketId, "sla", refreshKey ?? null],
    queryFn: async (): Promise<{ indicator: SlaIndicator | null; manualResolution?: ManualResolutionView } | null> => {
      const res = await fetch(`/api/tickets/${ticketId}/sla`)
      if (!res.ok) return null
      const data = await res.json()
      return data
    },
    staleTime: 30_000,
    refetchInterval: (query) => query.state.data?.manualResolution?.runningCount || (query.state.data?.indicator?.source === "mailbox" && !query.state.data.indicator.completed) ? 15_000 : false,
  })
  const indicator = data?.indicator ?? null
  const manualResolution = data?.manualResolution ?? null
  // Client clock at the moment the current snapshot was received; the live
  // countdown measures elapsed time from here rather than trusting `asOf`
  // directly, so unsynced client/server clocks don't skew the number.
  const receivedAt = dataUpdatedAt
  // Until the first tick (or after a refetch) clock <= receivedAt, which the
  // clamp below treats as "no time passed since the snapshot".
  const [clock, setClock] = useState(0)

  // Only tick while a metric's clock is actually moving; when everything is
  // stopped or paused (outside hours / waiting on customer) we render statically.
  const anyRunning = !!manualResolution?.runningCount || (!!indicator && (indicator.firstResponse.running || indicator.resolution.running))
  useEffect(() => {
    if (!anyRunning) return
    const id = setInterval(() => setClock(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [anyRunning])

  /** Snapshot metric interpolated to the current client clock. */
  const live = (metric: SlaMetric): SlaMetric => {
    const elapsedSinceFetch = metric.running ? Math.max(0, clock - receivedAt) : 0
    return {
      ...metric,
      elapsedMs: metric.elapsedMs + elapsedSinceFetch,
      remainingMs: metric.remainingMs - elapsedSinceFetch,
    }
  }

  const manual = manualResolution ? (() => {
    const addedSecs = Math.floor(Math.max(0, clock - receivedAt) / 1000) * manualResolution.runningCount
    const trackedSecs = manualResolution.trackedSecs + addedSecs
    return {
      ...manualResolution, trackedSecs,
      overtimeSecs: Math.max(0, trackedSecs - manualResolution.estimatedMins * 60),
      status: trackedSecs > manualResolution.estimatedMins * 60 ? "BREACHED" as const : "ON_TRACK" as const,
    }
  })() : null
  return { indicator, manual, live }
}

/** SLA-06: on-ticket indicator (ON_TRACK/AT_RISK/BREACHED) with remaining/overdue time. */
export function SlaIndicatorBadge({
  ticketId,
  size = "sm",
  refreshKey,
}: {
  ticketId: string
  size?: "sm" | "md"
  /** Changes whenever the ticket conversation changes so stopped/paused clocks refresh immediately. */
  refreshKey?: number | string
}) {
  const { indicator, manual, live } = useSlaIndicator(ticketId, refreshKey)

  if (manual) {
    const style = STATUS_STYLE[manual.status]
    const remainingSecs = manual.estimatedMins * 60 - manual.trackedSecs
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-sans text-[11.5px] font-medium", style.bg, style.text)}
        title="Resolution SLA based on actual tracked work">
        Resolution: {style.label} · {formatWorkDuration(Math.abs(remainingSecs) * 1000)} {remainingSecs < 0 ? "over" : "left"}
      </span>
    )
  }
  if (!indicator) return null

  const style = STATUS_STYLE[indicator.overall]
  // The tighter of the two live (not-yet-stopped) metrics drives the displayed time.
  const activeMetric =
    indicator.firstResponse.status === indicator.overall ? indicator.firstResponse : indicator.resolution
  // Interpolate down from the snapshot only while this metric's clock is running.
  const { remainingMs } = live(activeMetric)
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


/** Keep short manual work and overtime visible to the second. */
export function formatWorkDuration(ms: number): string {
  const seconds = Math.floor(Math.abs(ms) / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return [hours ? `${hours}h` : "", minutes ? `${minutes}m` : "", remainder || (!hours && !minutes) ? `${remainder}s` : ""].filter(Boolean).join(" ")
}
