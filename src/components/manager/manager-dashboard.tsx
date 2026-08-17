"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { notifEvents } from "@/store";
import { useLondonGreeting } from "@/lib/london-time";
import { DualClock } from "@/components/dashboard/london-clock";
import { MetricCard } from "@/components/dashboard/metric-card";
import { cn } from "@/lib/utils";
import {
  AttentionSection,
  type AttentionTab,
  type OverdueGroup, type ReviewGroup, type SimpleTicket, type JoinRequest,
} from "./attention-section";
import { TeamTodaySection } from "./team-today-section";
import { ProjectsSection } from "./projects-section";
import { ActivityTodaySection, type ActivityItem } from "./activity-today-section";
import type { Distribution, MemberWorkload, ProjectHealth } from "./aggregate";

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
  if (d.total === 0) return null;
  const pctDone = Math.round((d.done / d.total) * 100);
  return (
    <div className="rounded-2xl border border-pen-card-border bg-pen-card px-5 py-4 shadow-pen-card">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="pen-text-label">State of play · {d.total} tickets</span>
          <span className="font-mono text-[12px] font-semibold tabular-nums text-emerald-500">{pctDone}% done</span>
        </div>
        <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-pen-surface">
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
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {SEGMENTS.map(({ key, label, color }) => {
            const n = d[key];
            if (n === 0) return null;
            return (
              <span key={key} className="flex items-center gap-1.5 font-sans text-[11px] text-pen-muted">
                <span className="block size-[7px] rounded-[2px]" style={{ backgroundColor: color, opacity: key === "todo" ? 0.35 : 1 }} />
                <span className="font-mono font-semibold tabular-nums text-pen-foreground">{n}</span>
                {label}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function ManagerDashboard({
  managerName, departmentName, digest, stats, distribution,
  overdueGroups, unassignedTickets, reviewGroups, joinRequests,
  members, projects, activity, activityTotal, noTeams,
}: {
  managerName: string;
  departmentName?: string | null;
  digest: string;
  stats: Stats;
  distribution: Distribution;
  overdueGroups: OverdueGroup[];
  unassignedTickets: SimpleTicket[];
  reviewGroups: ReviewGroup[];
  joinRequests: JoinRequest[];
  members: MemberWorkload[];
  projects: ProjectHealth[];
  activity: ActivityItem[];
  activityTotal: number;
  noTeams: boolean;
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

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-6 px-4 py-6 sm:px-6 xl:px-8">

      {/* ── Briefing band ── */}
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="pen-text-display">
                {timeGreeting}, {firstName}.
              </h1>
              {departmentName && (
                <span className="inline-flex items-center rounded-full border border-pen-card-border bg-pen-surface px-2.5 py-0.5 font-sans text-[11px] font-medium text-pen-muted">
                  {departmentName}
                </span>
              )}
            </div>
            <p className="mt-1.5 max-w-[68ch] font-sans text-[13px] leading-relaxed text-pen-muted">{digest}</p>
          </div>
          <DualClock className="shrink-0 justify-end" />
        </div>

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

        <StateOfPlay d={distribution} />
      </header>

      {noTeams ? (
        <div className="rounded-2xl border border-pen-card-border bg-pen-card px-4 py-8 text-center">
          <p className="font-sans text-[13px] text-pen-muted">No teams in your scope.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-7">
          {/* Left: the work queue */}
          <AttentionSection
            overdueGroups={overdueGroups}
            unassignedTickets={unassignedTickets}
            reviewGroups={reviewGroups}
            joinRequests={joinRequests}
            defaultTab={defaultTab}
          />

          {/* Right rail — each card scrolls internally; avoid clipping headers */}
          <div className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-5 xl:self-start">
            <TeamTodaySection members={members} />
            <ProjectsSection projects={projects} />
            <ActivityTodaySection items={activity} total={activityTotal} />
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
