"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Clock3, Search, MessageSquare, CheckCircle2, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPerformanceDuration } from "@/lib/reporting/user-performance";
import type {
  PerformanceTicketDetail,
  SlaOutcomeCounts,
  UserPerformance,
} from "@/lib/api/reports";

const PRIORITIES = ["Urgent", "Critical", "High", "Medium", "Low"] as const;
const PRIORITY_COLOR: Record<string, string> = {
  Urgent: "#ff4500",
  Critical: "#dc2626",
  High: "#f97316",
  Medium: "#ec4899",
  Low: "#22c55e",
};
const focusClass = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-blue focus-visible:ring-offset-2 focus-visible:ring-offset-sts-card";

function duration(seconds: number | null) {
  return seconds === null ? "—" : formatPerformanceDuration(seconds);
}

function SlaOutcome({ label, counts }: { label: string; counts: SlaOutcomeCounts }) {
  const judged = counts.met + counts.breached;
  const pct = judged ? Math.round((counts.met / judged) * 100) : null;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="font-sans text-[12px] font-medium text-sts-muted">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="font-sans text-[30px] font-semibold leading-none tracking-tight tabular-nums text-sts-foreground">
          {pct === null ? "—" : `${pct}%`}
        </span>
        <span className="font-sans text-[12px] text-sts-subtle">met</span>
      </div>
      <div
        className="flex h-1.5 overflow-hidden rounded-full bg-sts-surface"
        role="img"
        aria-label={`${label}: ${counts.met} met, ${counts.breached} breached`}
      >
        {judged > 0 && (
          <>
            <div className="h-full bg-sts-green" style={{ width: `${(counts.met / judged) * 100}%` }} />
            <div className="h-full bg-sts-red/70" style={{ width: `${(counts.breached / judged) * 100}%` }} />
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-[11px] tabular-nums">
        <span className="flex items-center gap-1 text-sts-green"><CheckCircle2 className="size-3" />{counts.met} met</span>
        <span className={cn("flex items-center gap-1", counts.breached ? "text-sts-red" : "text-sts-subtle")}><CircleAlert className="size-3" />{counts.breached} breached</span>
      </div>
      <p className="font-sans text-[11px] text-sts-subtle">
        {judged === 0 ? "No measured results" : `${judged} assessed`}
        {counts.pending > 0 && ` · ${counts.pending} pending`}
        {counts.noPolicy > 0 && ` · ${counts.noPolicy} no SLA`}
      </p>
    </div>
  );
}

function TimeStat({ label, seconds, samples, sub, Icon }: {
  label: string;
  seconds: number | null;
  samples: number;
  sub: string;
  Icon: React.ElementType;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="font-sans text-[12px] font-medium text-sts-muted">{label}</p>
      <p className="font-sans text-[26px] font-semibold leading-none tracking-tight tabular-nums text-sts-foreground">
        {duration(seconds)}
      </p>
      <p className="flex items-center gap-1.5 font-sans text-[11px] text-sts-subtle">
        <Icon className="size-3.5 shrink-0" />{sub}
      </p>
      <p className="mt-auto font-sans text-[11px] text-sts-subtle">
        Based on {samples} ticket{samples === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function SlaBadge({ outcome }: { outcome: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium",
      outcome === "Met" ? "bg-sts-green/10 text-sts-green" :
      outcome === "Breached" ? "bg-sts-red/10 text-sts-red" : "bg-sts-surface text-sts-subtle",
    )}>
      {outcome === "Met" ? <CheckCircle2 className="size-3" /> : outcome === "Breached" ? <CircleAlert className="size-3" /> : null}
      {outcome}
    </span>
  );
}

/** Profile view of the Reports "people performance" numbers for one person. */
export function ProfileSlaPerformance({ summary, details }: {
  summary: UserPerformance;
  details: PerformanceTicketDetail[];
}) {
  const [query, setQuery] = useState("");
  const [slaFilter, setSlaFilter] = useState("all");
  const doneTotal = PRIORITIES.reduce((n, p) => n + (summary.priorities[p] ?? 0), 0);
  const timed = details
    .filter((t) => t.completionSecs !== null || t.replySecs !== null)
    .sort((a, b) => (b.completedAt ?? b.repliedAt ?? "").localeCompare(a.completedAt ?? a.repliedAt ?? ""));
  const search = query.trim().toLowerCase();
  const filtered = timed.filter((t) => {
    const matchesSearch = `${t.ticket} ${t.title}`.toLowerCase().includes(search);
    const matchesSla = slaFilter === "all" ||
      (slaFilter === "breached" && (t.responseSla === "Breached" || t.resolutionSla === "Breached")) ||
      (slaFilter === "met" && t.responseSla === "Met" && t.resolutionSla === "Met");
    return matchesSearch && matchesSla;
  });

  return (
    <div className="flex shrink-0 flex-col gap-5">
      <section aria-label="SLA and response times" className="overflow-hidden rounded-2xl border border-sts-card-border bg-sts-card">
        <div className="p-5 sm:p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-sans text-[15px] font-semibold tracking-tight text-sts-foreground">SLA &amp; response times</h2>
              <p className="mt-1 font-sans text-[12px] text-sts-subtle">How quickly tickets receive a reply and reach completion.</p>
            </div>
            <span className="rounded-md bg-sts-surface px-2 py-1 font-sans text-[11px] text-sts-muted">Selected period</span>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4 xl:gap-0 xl:divide-x xl:divide-sts-card-border [&>div]:xl:px-6 [&>div:first-child]:xl:pl-0 [&>div:last-child]:xl:pr-0">
            <SlaOutcome label="Response SLA" counts={summary.responseSla} />
            <SlaOutcome label="Resolution SLA" counts={summary.resolutionSla} />
            <TimeStat label="Average first reply" seconds={summary.avgReplySecs} samples={summary.replySamples} sub="Created to first customer reply" Icon={MessageSquare} />
            <TimeStat label="Average completion" seconds={summary.avgCompletionSecs} samples={summary.completionSamples} sub="Created to done" Icon={Clock3} />
          </div>
        </div>
        <div className="border-t border-sts-card-border bg-sts-surface/40 px-5 py-4 sm:px-6">
          <div className="mb-3 flex items-center justify-between gap-2 font-sans">
            <h3 className="text-[12px] font-medium text-sts-muted">Completed by priority</h3>
            <span className="text-[11px] tabular-nums text-sts-subtle">{doneTotal} completed</span>
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-5">
            {PRIORITIES.map((p) => (
              <div key={p} className="flex items-center justify-between gap-2 border-l-2 pl-3" style={{ borderColor: PRIORITY_COLOR[p] }}>
                <span className="font-sans text-[12px] text-sts-muted">{p}</span>
                <span className="font-sans text-[20px] font-semibold tabular-nums text-sts-foreground">{summary.priorities[p] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-label="Ticket performance" className="overflow-hidden rounded-2xl border border-sts-card-border bg-sts-card">
        <div className="flex flex-col justify-between gap-4 p-5 sm:p-6 xl:flex-row xl:items-center">
          <div>
            <h2 className="font-sans text-[15px] font-semibold tracking-tight text-sts-foreground">Ticket performance</h2>
            <p className="mt-1 font-sans text-[12px] text-sts-subtle" aria-live="polite">
              {filtered.length} of {timed.length} ticket{timed.length === 1 ? "" : "s"} with recorded response or completion times
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-sts-subtle" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search ticket performance" placeholder="Search tickets…" className={cn("h-9 w-full rounded-lg border border-sts-card-border bg-sts-card pl-9 pr-3 font-sans text-[12px] text-sts-foreground placeholder:text-sts-subtle sm:w-48", focusClass)} />
            </div>
            <select value={slaFilter} onChange={(e) => setSlaFilter(e.target.value)} aria-label="Filter ticket SLA outcomes" className={cn("h-9 max-w-full rounded-lg border border-sts-card-border bg-sts-card px-2.5 font-sans text-[12px] text-sts-muted", focusClass)}>
              <option value="all">All SLA outcomes</option>
              <option value="breached">SLA breached</option>
              <option value="met">All SLAs met</option>
            </select>
          </div>
        </div>
        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] font-sans text-[12px]">
              <thead className="border-y border-sts-card-border bg-sts-surface/60 text-left text-[11px] text-sts-muted">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium sm:px-6">Ticket</th>
                  <th scope="col" className="px-3 py-3 font-medium">First reply</th>
                  <th scope="col" className="px-3 py-3 font-medium">Completed in</th>
                  <th scope="col" className="px-3 py-3 font-medium">Response SLA</th>
                  <th scope="col" className="px-3 py-3 font-medium">Resolution SLA</th>
                  <th scope="col" className="w-10"><span className="sr-only">Open ticket</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="group border-b border-sts-card-border transition-colors last:border-b-0 hover:bg-sts-surface/70 focus-within:bg-sts-surface/70">
                    <td className="max-w-[320px] px-5 py-3.5 sm:px-6">
                      <Link href={`/tickets/${t.id}`} className={cn("flex min-w-0 items-center gap-2.5 rounded-sm", focusClass)}>
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: PRIORITY_COLOR[t.priority] ?? "#94a3b8" }} title={t.priority} />
                        <span className="shrink-0 font-mono text-[11px] font-medium text-sts-id">{t.ticket}</span>
                        <span className="truncate text-sts-foreground" title={t.title}>{t.title}</span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 tabular-nums text-sts-muted">{duration(t.replySecs)}</td>
                    <td className="whitespace-nowrap px-3 py-3.5 tabular-nums text-sts-muted">{duration(t.completionSecs)}</td>
                    <td className="whitespace-nowrap px-3 py-3.5"><SlaBadge outcome={t.responseSla} /></td>
                    <td className="whitespace-nowrap px-3 py-3.5"><SlaBadge outcome={t.resolutionSla} /></td>
                    <td className="pr-5">
                      <Link href={`/tickets/${t.id}`} aria-label={`Open ${t.ticket}`} className={cn("flex size-7 items-center justify-center rounded-md text-sts-subtle transition-colors hover:bg-sts-surface hover:text-sts-foreground", focusClass)}><ArrowUpRight className="size-3.5" /></Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center border-t border-sts-card-border px-6 py-12 text-center">
            <Clock3 className="mb-3 size-6 text-sts-subtle" />
            <p className="font-sans text-[13px] font-medium text-sts-foreground">{timed.length === 0 ? "No recorded times yet" : "No matching tickets"}</p>
            <p className="mt-1 max-w-sm font-sans text-[12px] text-sts-subtle">{timed.length === 0 ? "Tickets appear here once a customer reply or completion time is recorded in this period." : "Try a different ticket name or SLA outcome."}</p>
            {timed.length > 0 && <button type="button" onClick={() => { setQuery(""); setSlaFilter("all"); }} className={cn("mt-4 rounded-md px-3 py-1.5 font-sans text-[12px] font-medium text-sts-blue hover:bg-sts-blue/10", focusClass)}>Clear filters</button>}
          </div>
        )}
      </section>
    </div>
  );
}

export function ProfileSlaPerformanceSkeleton() {
  return (
    <div className="shrink-0 rounded-2xl border border-sts-card-border bg-sts-card p-5 sm:p-6" aria-busy="true" aria-label="Loading SLA and response times">
      <h2 className="mb-2 font-sans text-[15px] font-semibold text-sts-foreground">SLA &amp; response times</h2>
      <div className="mb-6 h-3 w-2/3 animate-pulse rounded bg-sts-surface" />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="flex flex-col gap-3"><div className="h-3 w-24 animate-pulse rounded bg-sts-surface" /><div className="h-8 w-28 animate-pulse rounded bg-sts-surface" /><div className="h-1.5 animate-pulse rounded-full bg-sts-surface" /><div className="h-3 w-32 animate-pulse rounded bg-sts-surface" /></div>)}
      </div>
      <div className="mt-6 h-14 animate-pulse rounded-lg bg-sts-surface" />
    </div>
  );
}
