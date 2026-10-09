"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, CheckCircle2, FileText, Mail } from "lucide-react";
import { notifEvents } from "@/store";
import { useLondonGreeting } from "@/lib/london-time";
import { DualClock } from "@/components/dashboard/london-clock";
import { MetricCard } from "@/components/dashboard/metric-card";
import {
  AttentionSection,
  type AttentionTab,
  type OverdueGroup, type ReviewGroup, type SubDeptGroup, type JoinRequest,
} from "./attention-section";
import { SubDepartmentTodaySection } from "./sub-department-today-section";
import { SubDepartmentsSection, type SubDepartmentSummary } from "./sub-departments-section";
import { ActivityTodaySection, type ActivityItem } from "./activity-today-section";
import {
  SupportChannelsSection,
  type MailboxSummary,
  type SupportFormSummary,
} from "./support-channels-section";
import type { Distribution, MemberWorkload } from "./aggregate";

type Stats = {
  overdue: number; worstDaysLate: number;
  review: number; prCount: number;
  unassigned: number; movedToday: number; requests: number;
};

// ── State of play bar — every ticket in scope, bucketed once ─────────────────

const SEGMENTS = [
  { key: "done",    label: "done",        color: "#10b981" },
  { key: "review",  label: "in review",   color: "#7c3aed" },
  { key: "active",  label: "in progress", color: "#0a76b9" },
  { key: "overdue", label: "overdue",     color: "#ef4444" },
  { key: "todo",    label: "not started", color: "#64748b" },
] as const;

function StateOfPlay({ d }: { d: Distribution }) {
  if (d.total === 0) {
    return (
      <div className="rounded-xl bg-sts-surface/70 px-4 py-5 text-center font-sans text-[12px] text-sts-muted">
        No tickets in this department yet.
      </div>
    );
  }
  const pctDone = Math.round((d.done / d.total) * 100);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-sans text-[11px] font-semibold text-sts-muted">Ticket flow</span>
        <span className="font-mono text-[11px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{pctDone}% complete</span>
      </div>
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-sts-surface">
        {SEGMENTS.map(({ key, color }) => {
          const n = d[key];
          if (n === 0) return null;
          return (
            <div
              key={key}
              className="h-full min-w-[4px] rounded-[2px] transition-[width] duration-500"
              style={{ width: `${(n / d.total) * 100}%`, backgroundColor: color, opacity: key === "todo" ? 0.35 : 1 }}
              title={`${n} ${key}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {SEGMENTS.map(({ key, label, color }) => {
          const n = d[key];
          if (n === 0) return null;
          return (
            <span key={key} className="flex items-center gap-1.5 font-sans text-[10.5px] text-sts-muted">
              <span className="block size-[6px] rounded-[2px]" style={{ backgroundColor: color, opacity: key === "todo" ? 0.35 : 1 }} />
              <span className="font-mono font-semibold tabular-nums text-sts-foreground">{n}</span>
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function DepartmentPulse({
  distribution,
  mailboxes,
  supportForms,
  subDepartments,
  attentionCount,
}: {
  distribution: Distribution;
  mailboxes: MailboxSummary[];
  supportForms: SupportFormSummary[];
  subDepartments: SubDepartmentSummary[];
  attentionCount: number;
}) {
  const open = Math.max(0, distribution.total - distribution.done);
  const receivingMailboxes = mailboxes.filter(
    (mailbox) => mailbox.isActive && mailbox.status === "ACTIVE",
  ).length;
  const activeForms = supportForms.filter((form) => form.isActive).length;
  const mailboxIssues = mailboxes.filter(
    (mailbox) => !mailbox.isActive || mailbox.status !== "ACTIVE",
  ).length;
  const totalAttentionCount = attentionCount + mailboxIssues;
  const healthy = totalAttentionCount === 0;

  const facts = [
    { icon: Activity, label: "In progress", value: distribution.active, detail: "being worked now" },
    { icon: Mail, label: "Shared mailboxes", value: mailboxes.length, detail: `${receivingMailboxes} receiving mail` },
    { icon: FileText, label: "Support forms", value: supportForms.length, detail: `${activeForms} accepting tickets` },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-sts-card-border bg-sts-card shadow-sts-card">
      <div className="grid lg:grid-cols-[minmax(260px,0.8fr)_minmax(420px,1.55fr)]">
        <div className="relative overflow-hidden border-b border-sts-card-border bg-[color-mix(in_srgb,var(--sts-blue)_8%,var(--sts-card))] px-5 py-5 lg:border-b-0 lg:border-r sm:px-6">
          <div className="absolute -right-12 -top-16 size-44 rounded-full bg-sts-blue/8 blur-2xl" />
          <div className="relative flex h-full flex-col justify-between gap-5">
            <div>
              <span className="sts-text-label">Department health</span>
              <div className="mt-3 flex items-center gap-3">
                <span className={`flex size-10 items-center justify-center rounded-xl ${healthy ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/12 text-amber-600 dark:text-amber-400"}`}>
                  {healthy ? <CheckCircle2 className="size-5" /> : <AlertTriangle className="size-5" />}
                </span>
                <div>
                  <p className="font-sans text-[18px] font-semibold tracking-[-0.02em] text-sts-foreground">
                    {healthy ? "Running smoothly" : `${totalAttentionCount} item${totalAttentionCount === 1 ? "" : "s"} need attention`}
                  </p>
                  <p className="mt-0.5 font-sans text-[11.5px] text-sts-muted">
                    Across {subDepartments.length} sub-department{subDepartments.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-end gap-2">
              <span className="font-mono text-[38px] font-semibold leading-none tabular-nums tracking-[-0.05em] text-sts-foreground">{open}</span>
              <span className="pb-1 font-sans text-[11px] text-sts-muted">running ticket{open === 1 ? "" : "s"}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-5 px-5 py-5 sm:px-6">
          <div className="grid grid-cols-1 divide-y divide-sts-card-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {facts.map(({ icon: Icon, label, value, detail }) => (
              <div key={label} className="min-w-0 py-3 first:pt-0 last:pb-0 sm:px-5 sm:py-0 sm:first:pl-0 sm:first:pt-0 sm:last:pr-0 sm:last:pb-0">
                <div className="flex items-center gap-1.5 text-sts-muted">
                  <Icon className="size-3.5 shrink-0" />
                  <span className="truncate font-sans text-[10px] font-semibold uppercase tracking-[0.08em]">{label}</span>
                </div>
                <p className="mt-2 font-mono text-[24px] font-semibold leading-none tabular-nums text-sts-foreground">{value}</p>
                <p className="mt-1 font-sans text-[10.5px] text-sts-subtle">{detail}</p>
              </div>
            ))}
          </div>
          <StateOfPlay d={distribution} />
        </div>
      </div>
    </section>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function ManagerDashboard({
  managerName, departmentName, digest, stats, distribution,
  overdueGroups, unassignedGroups, reviewGroups, joinRequests,
  members, mailboxes = [], supportForms = [], canManageForms = false,
  subDepartments, activity, activityTotal, noSubDepartments,
}: {
  managerName: string;
  departmentName?: string | null;
  digest: string;
  stats: Stats;
  distribution: Distribution;
  overdueGroups: OverdueGroup[];
  unassignedGroups: SubDeptGroup[];
  reviewGroups: ReviewGroup[];
  joinRequests: JoinRequest[];
  members: MemberWorkload[];
  mailboxes: MailboxSummary[];
  supportForms: SupportFormSummary[];
  canManageForms: boolean;
  subDepartments: SubDepartmentSummary[];
  activity: ActivityItem[];
  activityTotal: number;
  noSubDepartments: boolean;
}) {
  const firstName = managerName.split(" ")[0];
  const timeGreeting = useLondonGreeting();
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    return notifEvents.subscribe((_id, type) => {
      if (type === "join_request") startTransition(() => router.refresh());
    });
  }, [router]);

  function scrollToAttention(tab: AttentionTab) {
    const el = document.getElementById("attention");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.dispatchEvent(new CustomEvent("manager-focus-attention", { detail: tab }));
  }

  function scrollToActivity() {
    document.getElementById("activity")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const defaultTab: AttentionTab =
    stats.overdue > 0 ? "overdue"
    : stats.unassigned > 0 ? "unassigned"
    : stats.review > 0 ? "review"
    : stats.requests > 0 ? "requests"
    : "overdue";
  const attentionTicketIds = new Set([
    ...overdueGroups.flatMap((group) => group.tickets.map((ticket) => ticket.id)),
    ...unassignedGroups.flatMap((group) => group.tickets.map((ticket) => ticket.id)),
    ...reviewGroups.flatMap((group) => group.tickets.map((ticket) => ticket.id)),
  ]);
  const attentionCount = attentionTicketIds.size + stats.requests;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-5 px-4 py-5 sm:px-6 xl:px-8">

      {/* ── Briefing band ── */}
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-sts-subtle">Department overview</p>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="sts-text-display">
                {timeGreeting}, {firstName}.
              </h1>
              {departmentName && (
                <span className="inline-flex items-center rounded-full border border-sts-card-border bg-sts-surface px-2.5 py-0.5 font-sans text-[11px] font-medium text-sts-muted">
                  {departmentName}
                </span>
              )}
            </div>
            <p className="mt-1.5 max-w-[68ch] font-sans text-[13px] leading-relaxed text-sts-muted">{digest}</p>
          </div>
          <DualClock hideBangladesh className="shrink-0 justify-end" />
        </div>

        <DepartmentPulse
          distribution={distribution}
          mailboxes={mailboxes}
          supportForms={supportForms}
          subDepartments={subDepartments}
          attentionCount={attentionCount}
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            label="Overdue" value={stats.overdue} color="#ef4444"
            sub={stats.overdue > 0 ? `worst is ${stats.worstDaysLate}d late` : "nothing late"}
            onClick={() => scrollToAttention("overdue")}
          />
          <MetricCard
            label="Needs review" value={stats.review} color="#7c3aed"
            sub={stats.prCount > 0 ? `${stats.prCount} pull requests` : "no pull requests"}
            onClick={() => scrollToAttention("review")}
          />
          <MetricCard
            label="Unassigned" value={stats.unassigned} color="#f59e0b"
            sub={stats.unassigned > 0 ? "waiting for triage" : "all assigned"}
            onClick={() => scrollToAttention("unassigned")}
          />
          <MetricCard
            label="Moved today" value={stats.movedToday} color="#10b981"
            sub="tickets changed status"
            onClick={stats.movedToday > 0 ? scrollToActivity : undefined}
          />
        </div>
      </header>

      {noSubDepartments ? (
        <div className="rounded-2xl border border-sts-card-border bg-sts-card px-4 py-8 text-center">
          <p className="font-sans text-[13px] text-sts-muted">No sub departments in your scope.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]">
            <SupportChannelsSection
              mailboxes={mailboxes}
              forms={supportForms}
              canManageForms={canManageForms}
            />
            <SubDepartmentsSection subDepartments={subDepartments} />
          </div>

          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.55fr)]">
            <AttentionSection
              overdueGroups={overdueGroups}
              unassignedGroups={unassignedGroups}
              reviewGroups={reviewGroups}
              joinRequests={joinRequests}
              defaultTab={defaultTab}
            />

            <div className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-5 xl:self-start">
              <SubDepartmentTodaySection members={members} />
              <ActivityTodaySection items={activity} total={activityTotal} />
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
