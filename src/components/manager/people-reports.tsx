"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Eye, FlaskConical, Globe, Inbox, ListTodo, X, Zap, ChartPie } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/user-avatar";
import { DrawerLink } from "@/components/tickets/drawer-link";
import { StatTile } from "./stat-tile";
import { PageHeader } from "@/components/ui/page-header";
import { formatDuration, type TimeSummary } from "./aggregate";
import { PeopleRangePicker } from "./people-range-picker";
import type { PeopleRangePreset } from "./people-range";

// ── Types ────────────────────────────────────────────────────────────────────

type ReportTicket = {
  id: string; humanId: string; title: string; priority: string; status: string;
  dueDate: string | null; updatedAt: string;
  project: { name: string; color: string } | null;
  /** Present when the ticket belongs to another department */
  departmentName?: string | null;
};

type ReportActivity = {
  id: string; action: string; createdAt: string; statusTo: string | null;
  ticket: { id: string; humanId: string; title: string };
};

export type PersonReport = {
  id: string; name: string; avatarUrl: string | null;
  /** True when this person isn't a member of the viewed department (works here via cross-dept access) */
  isExternal: boolean;
  /** The external contributor's own (home) department name, for labelling */
  homeDepartmentName: string | null;
  openTickets: ReportTicket[];
  overdueCount: number;
  shippedReview: ReportTicket[];
  shippedDone: ReportTicket[];
  /** Tickets this person created on this department's teams (in range) */
  createdInDept: ReportTicket[];
  /** Open tickets assigned to this person on teams outside the active department */
  crossDeptOpen: ReportTicket[];
  /** Review/done tickets (7d) assigned outside the active department */
  crossDeptShipped: ReportTicket[];
  /** Tickets this person created on teams outside the active department (in range) */
  crossDeptCreated: ReportTicket[];
  /** Dev time (secs) this person logged on tickets outside the active department */
  crossDeptDevSecs: number;
  /** QA time (secs) this person logged on tickets outside the active department */
  crossDeptQaSecs: number;
  /** True when this person has ever been a QA assignee — gates all QA stats UI */
  hasQaAssignment: boolean;
  /** Tickets where this person is a QA assignee — still open */
  qaOpen: ReportTicket[];
  /** Tickets where this person is a QA assignee — finished in last 7 days */
  qaDone: ReportTicket[];
  time: TimeSummary;
  qaTime: TimeSummary;
  activity: ReportActivity[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * True when a person has any recorded work in the period: an assigned ticket,
 * shipped work, cross-dept work, QA load, tracked time, or activity. Drives the
 * detail drawer's "nothing to show" empty state.
 */
export function hasRecordedWork(r: PersonReport): boolean {
  return (
    r.openTickets.length > 0 ||
    r.shippedReview.length > 0 ||
    r.shippedDone.length > 0 ||
    r.createdInDept.length > 0 ||
    r.crossDeptOpen.length > 0 ||
    r.crossDeptShipped.length > 0 ||
    r.crossDeptCreated.length > 0 ||
    r.crossDeptDevSecs > 0 ||
    r.crossDeptQaSecs > 0 ||
    (r.hasQaAssignment && (r.qaOpen.length > 0 || r.qaDone.length > 0)) ||
    r.time.byTicket.length > 0 ||
    (r.hasQaAssignment && r.qaTime.byTicket.length > 0) ||
    r.activity.length > 0
  );
}

/** Below this much logged time (dev + QA) in the period counts as "not logging". */
export const MIN_LOGGED_SECS = 30 * 60;

/** Open tickets on this person's plate (in-dept + cross-dept + QA). */
function openTicketCount(r: PersonReport): number {
  return r.openTickets.length + r.crossDeptOpen.length + (r.hasQaAssignment ? r.qaOpen.length : 0);
}

/**
 * True when a person needs a manager's attention:
 *   • no open tickets   → flagged (no work on their plate — assign them something)
 *   • has open tickets but logged under {@link MIN_LOGGED_SECS} → flagged
 *     (they aren't logging the work they should be)
 * Anyone with open tickets who logged at least MIN_LOGGED_SECS is clearly
 * working and never flagged.
 */
export function needsAttention(r: PersonReport): boolean {
  if (openTicketCount(r) === 0) return true;
  const loggedSecs = r.time.weekSecs + r.qaTime.weekSecs;
  return loggedSecs < MIN_LOGGED_SECS;
}

const PRIORITY_COLOR: Record<string, string> = {
  Urgent: "#ff4500", Critical: "#ef4444", High: "#f97316", Medium: "#ec4899", Low: "#64748b",
};

const ACTION_PHRASE: Record<string, string> = {
  STATUS_CHANGED: "moved", ASSIGNED: "assigned", COMMENT_ADDED: "commented on",
  ATTACHMENT_ADDED: "attached a file to", TICKET_CREATED: "created",
  PRIORITY_CHANGED: "changed priority of", DATE_CHANGED: "changed the due date of",
  TITLE_CHANGED: "renamed", FORWARDED: "forwarded", MENTION: "mentioned someone on",
};

const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit", hour12: false,
});

function shippedWhen(t: ReportTicket) {
  const d = Math.floor((Date.now() - new Date(t.updatedAt).getTime()) / 86_400_000);
  return <span className="font-sans text-[11.5px] text-pen-muted">{d === 0 ? "today" : `${d}d ago`}</span>;
}

function dueLabel(t: ReportTicket) {
  if (!t.dueDate) return <span className="font-sans text-[11.5px] text-pen-subtle">no due date</span>;
  const d = Math.floor((Date.now() - new Date(t.dueDate).getTime()) / 86_400_000);
  if (d > 0) return <span className="font-sans text-[11.5px] font-semibold text-red-500">{d}d late</span>;
  if (d === 0) return <span className="font-sans text-[11.5px] font-semibold text-amber-500">due today</span>;
  return <span className="font-sans text-[11.5px] text-pen-muted">in {-d}d</span>;
}

function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  const isPR = s.includes("pull") || s === "pr";
  const isDone = ["live", "done", "completed", "closed"].includes(s);
  return (
    <span className={cn(
      "inline-block rounded-md px-2 py-0.5 font-sans text-[10.5px] font-medium",
      isPR ? "bg-purple-500/10 text-purple-500"
        : isDone ? "bg-emerald-500/10 text-emerald-500"
        : "bg-pen-blue/10 text-pen-blue",
    )}>
      {status}
    </span>
  );
}

const GRID = "grid grid-cols-[92px_minmax(0,1fr)_100px] items-center gap-3 sm:grid-cols-[92px_minmax(0,1fr)_120px_100px]";

function TicketTable({ tickets, last, lastOf, showDepartment }: {
  tickets: ReportTicket[]; last: string; lastOf: (t: ReportTicket) => React.ReactNode;
  showDepartment?: boolean;
}) {
  return (
    <div>
      <div className={cn(GRID, "border-b border-pen-card-border bg-pen-surface/40 px-4 py-2")}>
        <span className="pen-text-table-head">Ticket</span>
        <span className="pen-text-table-head">Title</span>
        <span className="pen-text-table-head hidden sm:block">Status</span>
        <span className="pen-text-table-head text-right">{last}</span>
      </div>
      {tickets.map((t) => (
        <DrawerLink
          key={t.id}
          ticketId={t.id}
          href={`/tickets/${t.id}`}
          className={cn(
            GRID,
            "group border-b border-pen-card-border/40 px-4 last:border-b-0 transition-colors hover:bg-pen-surface/60",
            showDepartment ? "min-h-[40px] py-2" : "h-[40px]",
          )}
        >
          <span className="flex items-center gap-2">
            <span className="block size-[7px] shrink-0 rounded-full" style={{ backgroundColor: PRIORITY_COLOR[t.priority] ?? "#64748b" }} title={t.priority} />
            <span className="font-mono text-[11.5px] font-semibold text-pen-id">{t.humanId}</span>
          </span>
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-sans text-[12.5px] text-pen-foreground group-hover:text-pen-blue">{t.title}</span>
              {showDepartment && t.departmentName && (
                <span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-px font-sans text-[10px] text-amber-700 dark:text-amber-400">
                  {t.departmentName}
                </span>
              )}
            </span>
          </span>
          <span className="hidden sm:block"><StatusPill status={t.status} /></span>
          <span className="text-right">{lastOf(t)}</span>
        </DrawerLink>
      ))}
    </div>
  );
}

function SubHead({ icon: Icon, accent, children }: { icon: React.ElementType; accent: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 pb-2 pt-4">
      <Icon className="size-3.5" style={{ color: accent }} />
      <span className="pen-text-section-label">{children}</span>
    </div>
  );
}

// ── Summary row bits ───────────────────────────────────────────────────────────

// Per-person composition of work as a donut ring — active / overdue / in-review
// / done (last 7d) — drawn around whatever sits in the centre (the avatar).
function CompositionDonut({ segments, size, stroke, children }: {
  segments: { value: number; color: string; label: string }[];
  size: number; stroke: number; children?: React.ReactNode;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--pen-surface)" strokeWidth={stroke} />
        {total > 0 &&
          segments.map((s) => {
            if (s.value === 0) return null;
            const len = (s.value / total) * circ;
            const el = (
              <circle
                key={s.label}
                cx={size / 2} cy={size / 2} r={r}
                fill="none" stroke={s.color} strokeWidth={stroke}
                strokeDasharray={`${len} ${circ - len}`}
                strokeDashoffset={-offset}
              >
                <title>{`${s.value} ${s.label}`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">{children}</span>
    </span>
  );
}

// ── Grid card ──────────────────────────────────────────────────────────────────

function MiniStat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div
      className="flex flex-col items-center gap-1 rounded-xl py-2.5"
      style={{ backgroundColor: `${color}14` }}
    >
      <span
        className="font-mono text-[19px] font-bold leading-none tabular-nums"
        style={{ color: value > 0 ? color : "var(--pen-subtle, #64748b)" }}
      >
        {value}
      </span>
      <span className="font-sans text-[9.5px] font-medium uppercase tracking-wide text-pen-subtle">{label}</span>
    </div>
  );
}

function PersonGridCard({ r, onOpen, rangeLabel }: { r: PersonReport; onOpen: () => void; rangeLabel: string }) {
  const crossDeptCount =
    r.crossDeptOpen.length + r.crossDeptShipped.length + r.crossDeptCreated.length;
  const showQa = r.hasQaAssignment;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col gap-4 rounded-2xl border border-pen-card-border bg-pen-card p-5 text-left shadow-pen-card transition-all hover:-translate-y-0.5 hover:border-pen-blue/40 hover:shadow-md"
    >
      <div className="flex items-center gap-3.5">
        <span className="relative shrink-0">
          <CompositionDonut
            size={72}
            stroke={5}
            segments={[
              { value: Math.max(0, r.openTickets.length - r.overdueCount), color: "#0a76b9", label: "active" },
              { value: r.overdueCount, color: "#ef4444", label: "overdue" },
              { value: r.shippedReview.length, color: "#7c3aed", label: "in review" },
              { value: r.shippedDone.length, color: "#10b981", label: "done" },
            ]}
          >
            <UserAvatar name={r.name} avatarUrl={r.avatarUrl} size={52} />
          </CompositionDonut>
          { (r.time.running || (showQa && r.qaTime.running)) && (
            <span className="absolute bottom-0.5 right-0.5 flex size-3.5 rounded-full border-2 border-pen-card bg-emerald-500" title="Timer running">
              <span className="block size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
            </span>
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-sans text-[16px] font-semibold text-pen-foreground group-hover:text-pen-blue">{r.name}</span>
            {r.isExternal && (
              <span
                className="shrink-0 rounded bg-amber-500/10 px-1.5 py-px font-sans text-[10px] text-amber-700 dark:text-amber-400"
                title={r.homeDepartmentName ? `Works here via cross-dept access · home: ${r.homeDepartmentName}` : "Works here via cross-dept access"}
              >
                cross-dept{r.homeDepartmentName ? ` · ${r.homeDepartmentName}` : ""}
              </span>
            )}
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[12px] tabular-nums text-pen-muted">
            <Clock className="size-3.5 text-pen-subtle" />
            {formatDuration(r.time.weekSecs)}
            <span className="text-pen-subtle">dev</span>
            {showQa && r.qaTime.weekSecs > 0 && (
              <>
                <span className="text-pen-subtle">·</span>
                <span className="text-teal-700 dark:text-teal-400">
                  {formatDuration(r.qaTime.weekSecs)}
                </span>
                <span className="text-pen-subtle">qa · {rangeLabel}</span>
              </>
            )}
            {!(showQa && r.qaTime.weekSecs > 0) && (
              <span className="text-pen-subtle">tracked · {rangeLabel}</span>
            )}
          </span>
          {r.createdInDept.length > 0 && (
            <span className="flex items-center gap-1 font-sans text-[11px] text-pen-muted">
              <ListTodo className="size-3 shrink-0 text-pen-blue" />
              {r.createdInDept.length} created here
            </span>
          )}
          {!r.isExternal && crossDeptCount > 0 && (
            <span className="flex items-center gap-1 font-sans text-[11px] text-amber-700 dark:text-amber-400">
              <Globe className="size-3 shrink-0" />
              {crossDeptCount} cross-dept
            </span>
          )}
        </div>
      </div>

      <div className={cn("grid gap-2", showQa ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-4")}>
        <MiniStat value={r.openTickets.length} label="Open" color="#0a76b9" />
        <MiniStat value={r.overdueCount} label="Late" color="#ef4444" />
        <MiniStat value={r.shippedReview.length} label="Review" color="#7c3aed" />
        <MiniStat value={r.shippedDone.length} label="Done" color="#10b981" />
        {showQa && (
          <>
            <MiniStat value={r.qaOpen.length} label="QA open" color="#0d9488" />
            <MiniStat value={r.qaDone.length} label="QA done" color="#14b8a6" />
          </>
        )}
      </div>
    </button>
  );
}

// ── Detail (drawer body) ─────────────────────────────────────────────────────

function PersonDetailBody({ r, rangeLabel }: { r: PersonReport; rangeLabel: string }) {
  const shipped = [...r.shippedReview, ...r.shippedDone];
  const crossDeptAll = [...r.crossDeptOpen, ...r.crossDeptShipped, ...r.crossDeptCreated];
  const crossDeptSecs = r.crossDeptDevSecs + r.crossDeptQaSecs;
  const showQa = r.hasQaAssignment;
  const hasAny = hasRecordedWork(r);
  return (
    <div className="flex flex-col pb-2">
      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 px-4 py-4 sm:grid-cols-3">
            <StatTile label="Open" value={r.openTickets.length} color="#0a76b9" sub="on their plate" />
            <StatTile label="Overdue" value={r.overdueCount} color="#ef4444" sub={r.overdueCount > 0 ? "past due date" : "nothing late"} />
            <StatTile label="In review" value={r.shippedReview.length} color="#7c3aed" sub="awaiting sign-off" />
            <StatTile label="Done" value={r.shippedDone.length} color="#10b981" sub={rangeLabel} />
            {r.createdInDept.length > 0 && (
              <StatTile label="Created" value={r.createdInDept.length} color="#0a76b9" sub={`opened here · ${rangeLabel}`} />
            )}
            {showQa && (
              <>
                <StatTile label="QA open" value={r.qaOpen.length} color="#0d9488" sub="assigned as QA" />
                <StatTile label="QA done" value={r.qaDone.length} color="#14b8a6" sub={`finished · ${rangeLabel}`} />
              </>
            )}
            <StatTile
              label="Cross-dept"
              value={crossDeptAll.length}
              color="#d97706"
              sub={
                crossDeptSecs > 0
                  ? `${formatDuration(crossDeptSecs)} logged outside`
                  : crossDeptAll.length > 0
                    ? "outside this department"
                    : "none outside"
              }
            />
            <StatTile label="Dev today" value={r.time.todaySecs} display={formatDuration(r.time.todaySecs)} color="#0a76b9" sub="development" />
            <StatTile label="Dev · total" value={r.time.weekSecs} display={formatDuration(r.time.weekSecs)} color="#0a76b9" sub={`development · ${rangeLabel}`} />
            {showQa && (
              <>
                <StatTile label="QA today" value={r.qaTime.todaySecs} display={formatDuration(r.qaTime.todaySecs)} color="#0d9488" sub="testing" />
                <StatTile label="QA · total" value={r.qaTime.weekSecs} display={formatDuration(r.qaTime.weekSecs)} color="#0d9488" sub={`testing · ${rangeLabel}`} />
              </>
            )}
          </div>

          {/* Open tickets */}
          {r.openTickets.length > 0 && (
            <>
              <SubHead icon={ListTodo} accent="#0a76b9">Open tickets · {r.openTickets.length}</SubHead>
              <TicketTable tickets={r.openTickets} last="Due" lastOf={dueLabel} />
            </>
          )}

          {/* Shipped recently */}
          {shipped.length > 0 && (
            <>
              <SubHead icon={CheckCircle2} accent="#10b981">Shipped · {rangeLabel} · {shipped.length}</SubHead>
              <TicketTable tickets={shipped} last="When" lastOf={shippedWhen} />
            </>
          )}

          {/* Created here */}
          {r.createdInDept.length > 0 && (
            <>
              <SubHead icon={ListTodo} accent="#0a76b9">Created here · {rangeLabel} · {r.createdInDept.length}</SubHead>
              <TicketTable tickets={r.createdInDept} last="Due" lastOf={dueLabel} />
            </>
          )}

          {/* QA assignments */}
          {showQa && r.qaOpen.length > 0 && (
            <>
              <SubHead icon={FlaskConical} accent="#0d9488">
                QA open · {r.qaOpen.length}
              </SubHead>
              <TicketTable
                tickets={r.qaOpen}
                last="Due"
                lastOf={dueLabel}
                showDepartment={r.qaOpen.some((t) => !!t.departmentName)}
              />
            </>
          )}
          {showQa && r.qaDone.length > 0 && (
            <>
              <SubHead icon={FlaskConical} accent="#14b8a6">
                QA done · {rangeLabel} · {r.qaDone.length}
              </SubHead>
              <TicketTable
                tickets={r.qaDone}
                last="When"
                lastOf={shippedWhen}
                showDepartment={r.qaDone.some((t) => !!t.departmentName)}
              />
            </>
          )}

          {/* Cross-department contributions */}
          {r.crossDeptOpen.length > 0 && (
            <>
              <SubHead icon={Globe} accent="#d97706">
                Cross-dept open · {r.crossDeptOpen.length}
              </SubHead>
              <TicketTable tickets={r.crossDeptOpen} last="Due" lastOf={dueLabel} showDepartment />
            </>
          )}
          {r.crossDeptShipped.length > 0 && (
            <>
              <SubHead icon={Globe} accent="#d97706">
                Cross-dept shipped · {rangeLabel} · {r.crossDeptShipped.length}
              </SubHead>
              <TicketTable tickets={r.crossDeptShipped} last="When" lastOf={shippedWhen} showDepartment />
            </>
          )}
          {r.crossDeptCreated.length > 0 && (
            <>
              <SubHead icon={Globe} accent="#d97706">
                Cross-dept created · {rangeLabel} · {r.crossDeptCreated.length}
              </SubHead>
              <TicketTable tickets={r.crossDeptCreated} last="Due" lastOf={dueLabel} showDepartment />
            </>
          )}

          {/* Dev time by ticket */}
          {r.time.byTicket.length > 0 && (
            <>
              <SubHead icon={Clock} accent="#f59e0b">Dev time · {formatDuration(r.time.weekSecs)}</SubHead>
              <div className="px-4">
                {r.time.byTicket.map((b) => {
                  const pct = r.time.weekSecs > 0 ? (b.secs / r.time.weekSecs) * 100 : 0;
                  return (
                    <div key={`dev-${b.ticketId ?? "none"}`} className="flex flex-col gap-1 border-b border-pen-card-border/40 py-2.5 last:border-b-0">
                      <div className="flex items-center gap-2.5">
                        {b.ticketId ? (
                          <DrawerLink
                            ticketId={b.ticketId}
                            href={`/tickets/${b.ticketId}`}
                            className="group flex min-w-0 flex-1 items-baseline gap-2"
                          >
                            <span className="shrink-0 font-mono text-[11px] font-semibold text-pen-id group-hover:text-pen-blue">{b.humanId}</span>
                            <span className="min-w-0 truncate font-sans text-[12px] text-pen-muted group-hover:text-pen-blue">{b.title}</span>
                          </DrawerLink>
                        ) : (
                          <span className="min-w-0 flex-1 font-sans text-[12px] italic text-pen-subtle">No ticket</span>
                        )}
                        <span className="shrink-0 font-mono text-[11.5px] font-semibold tabular-nums text-pen-foreground">{formatDuration(b.secs)}</span>
                      </div>
                      <div className="h-[4px] overflow-hidden rounded-full bg-pen-surface">
                        <div className="h-full rounded-full bg-amber-500/70" style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                      {b.notes.length > 0 && (
                        <p className="truncate font-sans text-[10.5px] italic text-pen-subtle">{b.notes.join(" · ")}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* QA time by ticket */}
          {showQa && r.qaTime.byTicket.length > 0 && (
            <>
              <SubHead icon={Clock} accent="#0d9488">QA time · {formatDuration(r.qaTime.weekSecs)}</SubHead>
              <div className="px-4">
                {r.qaTime.byTicket.map((b) => {
                  const pct = r.qaTime.weekSecs > 0 ? (b.secs / r.qaTime.weekSecs) * 100 : 0;
                  return (
                    <div key={`qa-${b.ticketId ?? "none"}`} className="flex flex-col gap-1 border-b border-pen-card-border/40 py-2.5 last:border-b-0">
                      <div className="flex items-center gap-2.5">
                        {b.ticketId ? (
                          <DrawerLink
                            ticketId={b.ticketId}
                            href={`/tickets/${b.ticketId}`}
                            className="group flex min-w-0 flex-1 items-baseline gap-2"
                          >
                            <span className="shrink-0 font-mono text-[11px] font-semibold text-pen-id group-hover:text-pen-blue">{b.humanId}</span>
                            <span className="min-w-0 truncate font-sans text-[12px] text-pen-muted group-hover:text-pen-blue">{b.title}</span>
                          </DrawerLink>
                        ) : (
                          <span className="min-w-0 flex-1 font-sans text-[12px] italic text-pen-subtle">No ticket</span>
                        )}
                        <span className="shrink-0 font-mono text-[11.5px] font-semibold tabular-nums text-teal-700 dark:text-teal-400">{formatDuration(b.secs)}</span>
                      </div>
                      <div className="h-[4px] overflow-hidden rounded-full bg-pen-surface">
                        <div className="h-full rounded-full bg-teal-600/70" style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                      {b.notes.length > 0 && (
                        <p className="truncate font-sans text-[10.5px] italic text-pen-subtle">{b.notes.join(" · ")}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Activity today */}
          {r.activity.length > 0 && (
            <>
              <SubHead icon={Zap} accent="#f59e0b">Activity · {rangeLabel} · {r.activity.length}</SubHead>
              <div className="flex flex-col gap-2 px-4 pb-2">
                {r.activity.map((a) => {
                  const phrase = ACTION_PHRASE[a.action] ?? a.action.replaceAll("_", " ").toLowerCase();
                  return (
                    <div key={a.id} className="flex items-start gap-2.5">
                      <span className="w-[34px] shrink-0 pt-[1px] font-mono text-[10px] tabular-nums text-pen-subtle">
                        {timeFmt.format(new Date(a.createdAt))}
                      </span>
                      <span className="min-w-0 flex-1 font-sans text-[11.5px] leading-[1.5] text-pen-muted">
                        {phrase}{" "}
                        <DrawerLink
                          ticketId={a.ticket.id}
                          href={`/tickets/${a.ticket.id}`}
                          className="font-mono text-[10.5px] font-semibold text-pen-id hover:text-pen-blue"
                        >
                          {a.ticket.humanId}
                        </DrawerLink>
                        {a.statusTo && <span className="text-pen-subtle"> → <span className="text-pen-foreground">{a.statusTo}</span></span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

      {!hasAny && (
        <p className="px-4 py-4 font-sans text-[12px] italic text-pen-subtle">No work recorded in {rangeLabel}.</p>
      )}
    </div>
  );
}

// ── Detail drawer ────────────────────────────────────────────────────────────

function PersonDrawer({ person, onClose, rangeLabel }: { person: PersonReport | null; onClose: () => void; rangeLabel: string }) {
  const open = !!person;
  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 pen-overlay-backdrop transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[600px] max-w-[calc(100vw-40px)] flex-col border-l border-pen-card-border bg-pen-bg shadow-2xl transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
        role="dialog"
        aria-modal="true"
      >
        {person && (
          <>
            <div className="flex h-14 shrink-0 items-center gap-3 border-b border-pen-card-border bg-pen-card px-4">
              <span className="relative shrink-0">
                <UserAvatar name={person.name} avatarUrl={person.avatarUrl} size={34} />
                {(person.time.running || (person.hasQaAssignment && person.qaTime.running)) && (
                  <span className="absolute -bottom-0.5 -right-0.5 block size-3 rounded-full border-2 border-pen-card bg-emerald-500" title="Timer running" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate pen-text-card-title">{person.name}</span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex size-7 items-center justify-center rounded-md text-pen-subtle transition-colors hover:bg-pen-surface hover:text-pen-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <PersonDetailBody r={person} rangeLabel={rangeLabel} />
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ── Needs-attention section ─────────────────────────────────────────────────────

type AttentionTone = "amber" | "slate";

const ATTENTION_TONE: Record<AttentionTone, { chip: string; note: string; label: string; icon: string }> = {
  amber: {
    chip: "border-amber-500/30 hover:border-amber-500/60",
    note: "text-amber-700 dark:text-amber-400",
    label: "text-amber-700 dark:text-amber-300",
    icon: "text-amber-600 dark:text-amber-400",
  },
  slate: {
    chip: "border-pen-card-border hover:border-pen-blue/40",
    note: "text-pen-subtle",
    label: "text-pen-muted",
    icon: "text-pen-subtle",
  },
};

// One labelled group of flagged people (e.g. "Not logging work" / "No open tickets").
function AttentionGroup({ icon: Icon, label, tone, people, noteOf, onOpen }: {
  icon: React.ElementType;
  label: string;
  tone: AttentionTone;
  people: PersonReport[];
  noteOf: (r: PersonReport) => string;
  onOpen: (id: string) => void;
}) {
  const t = ATTENTION_TONE[tone];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Icon className={cn("size-3.5 shrink-0", t.icon)} />
        <span className={cn("font-sans text-[11px] font-semibold uppercase tracking-wide", t.label)}>
          {label} · {people.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {people.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onOpen(r.id)}
            className={cn(
              "group flex items-center gap-2.5 rounded-xl border bg-pen-card px-3 py-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
              t.chip,
            )}
          >
            <UserAvatar name={r.name} avatarUrl={r.avatarUrl} size={30} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-sans text-[13px] font-medium text-pen-foreground group-hover:text-pen-blue">
                {r.name}
              </span>
              <span className={cn("truncate font-sans text-[10.5px]", t.note)}>{noteOf(r)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Always-visible section grouping flagged people by reason — those not logging
// the work they should, and those with no open tickets (free capacity). When
// nobody qualifies it shows an explicit all-clear state, so a manager can always
// tell the check ran rather than seeing nothing at all.
function NeedsAttentionPanel({ people, onOpen, rangeLabel }: {
  people: PersonReport[]; onOpen: (id: string) => void; rangeLabel: string;
}) {
  if (people.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-3">
        <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span className="font-sans text-[13px] font-semibold text-emerald-700 dark:text-emerald-300">
          Needs attention · 0
        </span>
        <span className="font-sans text-[11.5px] text-emerald-700/70 dark:text-emerald-400/70">
          everyone has open tickets and logged work in {rangeLabel}
        </span>
      </div>
    );
  }

  const notLogging = people.filter((r) => openTicketCount(r) > 0);
  const noTickets = people.filter((r) => openTicketCount(r) === 0);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-pen-card-border bg-pen-card p-4 shadow-pen-card sm:p-5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="font-sans text-[13.5px] font-semibold text-pen-foreground">
          Needs attention · {people.length}
        </span>
        <span className="font-sans text-[11.5px] text-pen-subtle">
          in {rangeLabel}
        </span>
      </div>

      {notLogging.length > 0 && (
        <AttentionGroup
          icon={Clock}
          label="Not logging work"
          tone="amber"
          people={notLogging}
          onOpen={onOpen}
          noteOf={(r) => {
            const open = openTicketCount(r);
            const logged = r.time.weekSecs + r.qaTime.weekSecs;
            return `${open} open ticket${open === 1 ? "" : "s"} · ${logged === 0 ? "nothing logged" : `only ${formatDuration(logged)} logged`}`;
          }}
        />
      )}

      {noTickets.length > 0 && (
        <AttentionGroup
          icon={Inbox}
          label="No open tickets"
          tone="slate"
          people={noTickets}
          onOpen={onOpen}
          noteOf={(r) => {
            const logged = r.time.weekSecs + r.qaTime.weekSecs;
            return logged > 0 ? `free capacity · ${formatDuration(logged)} logged` : "free capacity · nothing logged";
          }}
        />
      )}
    </div>
  );
}

// ── Page shell ───────────────────────────────────────────────────────────────

export function PeopleReportsHeader({
  peopleCount,
  range,
}: {
  peopleCount?: number;
  range?: { preset: PeopleRangePreset; label: string };
}) {
  return (
    <PageHeader
      title="Sub Departments"
      icon={ChartPie}
      iconClassName="text-pen-blue"
      description="One card per person — workload, shipped work, cross-dept contributions, tracked time, and activity over the selected date range. Click a card for the full report."
      trailing={
        <div className="flex flex-col items-end gap-2">
          {range && <PeopleRangePicker preset={range.preset} label={range.label} />}
          <div className="hidden flex-col items-end gap-2 sm:flex">
            {peopleCount != null && (
              <div className="flex items-center gap-2">
                <Eye className="size-3.5 text-pen-subtle" />
                <span className="font-sans text-[11.5px] text-pen-subtle">
                  {peopleCount} people
                </span>
              </div>
            )}
            <div className="flex items-center gap-3 font-sans text-[10.5px] text-pen-subtle">
              {[
                ["#0a76b9", "active"],
                ["#ef4444", "late"],
                ["#7c3aed", "in review"],
                ["#10b981", "done"],
              ].map(([color, label]) => (
                <span key={label} className="flex items-center gap-1">
                  <span
                    className="block size-[7px] rounded-[2px]"
                    style={{ backgroundColor: color }}
                  />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      }
    />
  );
}

export function PeopleReportsGrid({
  reports,
  noSubDepartments,
  rangeLabel,
}: {
  reports: PersonReport[];
  noSubDepartments: boolean;
  rangeLabel: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = reports.find((r) => r.id === selectedId) ?? null;

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#p-")) setSelectedId(hash.slice(3));
  }, []);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  if (noSubDepartments) {
    return (
      <div className="rounded-2xl border border-pen-card-border bg-pen-card px-4 py-6 text-center">
        <p className="font-sans text-[12.5px] text-pen-muted">No teams in your scope.</p>
      </div>
    );
  }

  const flagged = reports.filter((r) => !r.isExternal && needsAttention(r));

  return (
    <>
      <NeedsAttentionPanel people={flagged} onOpen={setSelectedId} rangeLabel={rangeLabel} />
      <div className="grid grid-cols-1 gap-5 min-[560px]:grid-cols-[repeat(auto-fill,minmax(340px,1fr))]">
        {reports.map((r) => (
          <PersonGridCard key={r.id} r={r} onOpen={() => setSelectedId(r.id)} rangeLabel={rangeLabel} />
        ))}
      </div>
      <PersonDrawer person={selected} onClose={() => setSelectedId(null)} rangeLabel={rangeLabel} />
    </>
  );
}
