"use client"

import { AlertTriangle, CheckCircle2, Info, MessageSquareReply, PauseCircle, Timer } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDateTime } from "@/lib/format"
import {
  formatDuration,
  formatWorkDuration,
  useSlaIndicator,
  type SlaIndicator,
  type SlaMetric,
} from "@/components/tickets/sla-indicator-badge"

type Details = NonNullable<SlaIndicator["details"]>
type Tone = "ok" | "risk" | "breach"

const TONE: Record<Tone, { pill: string; bar: string; text: string; dot: string }> = {
  ok: {
    pill: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400",
    bar: "bg-emerald-500 dark:bg-emerald-400",
    text: "text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  risk: {
    pill: "bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400",
    bar: "bg-amber-500 dark:bg-amber-400",
    text: "text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  breach: {
    pill: "bg-red-500/10 text-red-700 dark:bg-red-400/10 dark:text-red-400",
    bar: "bg-red-500 dark:bg-red-400",
    text: "text-red-700 dark:text-red-400",
    dot: "bg-red-500",
  },
}

/**
 * Sidebar SLA breakdown for tenant admins and the department's admins/managers:
 * Time to first response and Time to resolution — target vs. actual (business)
 * time, when it was met, and whether it breached. Renders nothing for other
 * viewers (the API omits `details` for them) or tickets without an SLA.
 */
export function SlaDetailsSection({
  ticketId,
  refreshKey,
}: {
  ticketId: string
  refreshKey?: number | string
}) {
  const { indicator, manual, live } = useSlaIndicator(ticketId, refreshKey)
  if (manual?.details) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="sts-text-label">SLA overview</p>
        <p className="font-sans text-[11px] text-sts-subtle">Estimated time compared with actual tracked work.</p>
        <MetricCard icon={CheckCircle2} label="Resolution" metric={{
          status: manual.status, elapsedMs: manual.trackedSecs * 1000,
          targetMs: manual.estimatedMins * 60_000,
          remainingMs: (manual.estimatedMins * 60 - manual.trackedSecs) * 1000,
          running: manual.runningCount > 0,
        }} startedAt={manual.details.firstWorkedAt} stoppedAt={manual.details.resolvedAt}
          metLabel="Resolved" pendingLabel="Work tracking" frozen={false}
          breaches={manual.details.breaches} strictExceed formatTime={formatWorkDuration} />
      </div>
    )
  }
  if (!indicator?.details) return null
  const details = indicator.details
  const closed = details.resolutionStoppedAt !== null

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="sts-text-label flex items-center gap-1">
          SLA overview
          <span
            className="text-sts-subtle"
            title="Times count business hours only and exclude waiting-on-customer pauses."
          >
            <Info className="size-3" />
          </span>
        </p>
        {details.policyName ? (
          <span
            className="min-w-0 truncate rounded-full bg-sts-surface px-2 py-0.5 font-sans text-[10.5px] font-medium text-sts-subtle"
            title={`SLA policy: ${details.policyName}`}
          >
            {details.policyName}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <MetricCard
          icon={MessageSquareReply}
          label="First response"
          metric={live(indicator.firstResponse)}
          startedAt={details.firstResponseStartedAt}
          stoppedAt={details.firstResponseStoppedAt}
          metLabel="Responded"
          // A ticket closed without any public agent reply never stops this clock.
          pendingLabel={closed ? "Closed without a reply" : "Awaiting reply"}
          frozen={closed}
          breaches={details.breaches.filter((b) => b.metric === "first_response")}
        />
        <MetricCard
          icon={CheckCircle2}
          label="Resolution"
          strictExceed={indicator.source === "mailbox"}
          metric={live(indicator.resolution)}
          startedAt={details.resolutionStartedAt}
          stoppedAt={details.resolutionStoppedAt}
          metLabel="Resolved"
          pendingLabel={details.resolutionStartedAt ? "Open" : "Awaiting agent work"}
          frozen={false}
          breaches={details.breaches.filter((b) => b.metric === "resolution")}
        />
      </div>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  metric,
  startedAt,
  stoppedAt,
  metLabel,
  pendingLabel,
  frozen,
  breaches,
  strictExceed = false,
  formatTime = formatDuration,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  metric: SlaMetric
  startedAt: string | null
  stoppedAt: string | null
  metLabel: string
  pendingLabel: string
  /** Clock never stopped, but the ticket is closed so nothing more will happen. */
  frozen: boolean
  breaches: Details["breaches"]
  strictExceed?: boolean
  formatTime?: (ms: number) => string
}) {
  // Re-derive from the live-interpolated numbers so a running clock flips to
  // "Breached" on screen the moment it crosses the target.
  const breached = (strictExceed ? metric.remainingMs < 0 : metric.remainingMs <= 0) || metric.status === "BREACHED"
  const done = stoppedAt !== null
  const tone: Tone = breached ? "breach" : metric.status === "AT_RISK" && !done ? "risk" : "ok"
  const verdict = breached ? "Breached" : done ? "Met" : tone === "risk" ? "At risk" : "On track"
  const paused = !done && !frozen && !metric.running
  const pct = metric.targetMs > 0 ? Math.min(100, (metric.elapsedMs / metric.targetMs) * 100) : 100
  const lastBreach = breaches.at(-1)

  return (
    <div className="flex flex-col gap-2 rounded-[10px] bg-sts-surface/60 px-3 py-2.5 ring-1 ring-sts-card-border">
      {/* Header: metric + verdict */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 font-sans text-[12px] font-medium text-sts-subtle">
          <Icon className="size-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-sans text-[10.5px] font-semibold",
            TONE[tone].pill,
          )}
        >
          <span className={cn("size-1.5 rounded-full", TONE[tone].dot, !done && !frozen && metric.running && "animate-pulse")} />
          {verdict}
        </span>
      </div>

      {/* Actual vs. target */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-sans text-[18px] font-semibold leading-none tabular-nums text-sts-foreground">
          {formatTime(metric.elapsedMs)}
        </span>
        <span className="font-sans text-[11px] text-sts-subtle tabular-nums">
          target {formatTime(metric.targetMs)}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-sts-card-border/70">
          <div className={cn("h-full rounded-full transition-all", TONE[tone].bar)} style={{ width: `${pct}%` }} />
        </div>
        <span className={cn("font-sans text-[11px] font-medium tabular-nums", TONE[tone].text)}>
          {breached
            ? `${formatTime(metric.remainingMs)} over target`
            : done
              ? `${formatTime(metric.remainingMs)} under target`
              : `${formatTime(metric.remainingMs)} left`}
        </span>
      </div>

      {/* Timeline */}
      <ol className="flex flex-col gap-1 border-t border-sts-card-border pt-2 font-sans text-[11px]">
        {startedAt ? <TimelineRow dot="bg-sts-subtle/50" term="Started" value={formatDateTime(new Date(startedAt))} /> : null}
        {lastBreach ? (
          <TimelineRow
            dot={TONE.breach.dot}
            term={breaches.length > 1 ? `Breached ×${breaches.length}` : "Breached"}
            value={formatDateTime(new Date(lastBreach.breachedAt))}
            valueClass={TONE.breach.text}
            icon={<AlertTriangle className="size-3" />}
          />
        ) : null}
        {done ? (
          <TimelineRow
            dot={TONE[breached ? "breach" : "ok"].dot}
            term={metLabel}
            value={formatDateTime(new Date(stoppedAt))}
          />
        ) : (
          <TimelineRow
            dot="bg-sts-card-border"
            term={pendingLabel}
            value={!startedAt ? "Not started" : paused ? "Paused" : frozen ? "—" : "Running"}
            valueClass="text-sts-subtle"
            icon={paused ? <PauseCircle className="size-3" /> : frozen ? null : <Timer className="size-3" />}
          />
        )}
      </ol>
    </div>
  )
}

function TimelineRow({
  dot,
  term,
  value,
  valueClass,
  icon,
}: {
  dot: string
  term: string
  value: string
  valueClass?: string
  icon?: React.ReactNode
}) {
  return (
    <li className="flex items-center gap-2">
      <span className={cn("size-1.5 shrink-0 rounded-full", dot)} />
      <span className="text-sts-subtle">{term}</span>
      <span className={cn("ml-auto flex items-center gap-1 text-right tabular-nums text-sts-foreground", valueClass)}>
        {icon}
        {value}
      </span>
    </li>
  )
}
