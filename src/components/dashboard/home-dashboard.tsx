"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCircle2,
  FolderKanban,
  ListTodo,
  Zap,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store";
import { UserAvatar } from "@/components/ui/user-avatar";
import { DualClock } from "@/components/dashboard/london-clock";
import { MetricCard } from "@/components/dashboard/metric-card";
import { RailCard } from "@/components/manager/rail-card";
import { DrawerLink } from "@/components/tickets/drawer-link";
import { HomeDashboardSectionsSkeleton } from "@/components/skeletons/page-skeletons";
import { useLondonGreeting } from "@/lib/london-time";

// ── Types ─────────────────────────────────────────────────────────────────────

type TaskPriority = "urgent" | "critical" | "high" | "medium" | "low";
type AttentionKind = "overdue" | "due_soon" | "blocked";

export type AttentionTask = {
  id: string;
  dbId: string;
  title: string;
  priority: TaskPriority;
  kind: AttentionKind;
  dueLabel: string;
};

export type MyProject = {
  id: string;
  name: string;
  slug: string;
  color: string;
  openCount: number;
};

export type ActivityItem = {
  id: string;
  actor: string;
  actorAvatarUrl?: string | null;
  action: string;
  timestamp: string;
  avatarClass: string;
};

export type HomeDashboardData = {
  dateLine: string;
  metrics: {
    open: number;
    overdue: number;
    dueThisWeek: number;
    inProgress: number;
    completed: number;
    todo: number;
    timeTodaySecs: number;
    timeToday: string;
    qaTimeTodaySecs: number;
    qaTimeToday: string;
  };
  attention: AttentionTask[];
  projects: MyProject[];
  activity: ActivityItem[];
};

// ── Style maps ────────────────────────────────────────────────────────────────

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  urgent: "#ff4500",
  critical: "#dc2626",
  high: "#f97316",
  medium: "#ec4899",
  low: "#94a3b8",
};

const KIND_META: Record<AttentionKind, { color: string; label: string; Icon: React.ElementType }> = {
  overdue: { color: "#ef4444", label: "Overdue", Icon: AlertTriangle },
  due_soon: { color: "#f59e0b", label: "Due soon", Icon: CalendarClock },
  blocked: { color: "#7c3aed", label: "Blocked", Icon: Ban },
};

// ── Digest ──────────────────────────────────────────────────────────────────

function buildDigest(m: HomeDashboardData["metrics"]): string {
  if (m.open === 0) return "You're all caught up — nothing open on your plate right now.";
  const parts = [`${m.open} open task${m.open === 1 ? "" : "s"}`];
  if (m.overdue > 0) parts.push(`${m.overdue} overdue`);
  if (m.dueThisWeek > 0) parts.push(`${m.dueThisWeek} due this week`);
  if (m.inProgress > 0) parts.push(`${m.inProgress} in progress`);
  return `You have ${parts.join(", ")}.`;
}

// ── Attention ─────────────────────────────────────────────────────────────────

function AttentionRow({ t }: { t: AttentionTask }) {
  const meta = KIND_META[t.kind];
  return (
    <DrawerLink
      ticketId={t.dbId}
      href={`/tickets/${t.dbId}`}
      className="group flex items-center gap-3 border-b border-pen-card-border/40 px-4 py-3 transition-colors last:border-b-0 hover:bg-pen-surface/60"
    >
      <span
        className="block size-[8px] shrink-0 rounded-full"
        style={{ backgroundColor: PRIORITY_COLOR[t.priority] }}
        title={t.priority}
      />
      <span className="shrink-0 font-mono text-[11.5px] font-semibold text-pen-id group-hover:text-pen-blue">
        {t.id}
      </span>
      <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] text-pen-foreground group-hover:text-pen-blue">
        {t.title}
      </span>
      <span
        className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-sans text-[10.5px] font-medium"
        style={{ backgroundColor: `${meta.color}18`, color: meta.color }}
      >
        <meta.Icon className="size-3" />
        {t.dueLabel}
      </span>
    </DrawerLink>
  );
}

function AttentionCard({ attention }: { attention: AttentionTask[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-pen-card-border bg-pen-card shadow-pen-card">
      <div className="flex items-center gap-2.5 border-b border-pen-card-border px-4 py-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: "#ef444418" }}>
          <ListTodo className="size-3.5" style={{ color: "#ef4444" }} />
        </span>
        <span className="pen-text-card-title">Needs attention</span>
        {attention.length > 0 && (
          <span className="ml-auto rounded-full bg-pen-surface px-2 py-0.5 font-mono text-[11px] tabular-nums text-pen-muted">
            {attention.length}
          </span>
        )}
      </div>
      {attention.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <CheckCircle2 className="size-6 text-emerald-500" />
          <p className="font-sans text-[12.5px] text-pen-muted">
            Nothing overdue, due soon, or blocked. Nice.
          </p>
        </div>
      ) : (
        <div className="max-h-[min(560px,60vh)] overflow-y-auto">
          {attention.map((t) => (
            <AttentionRow key={t.dbId} t={t} />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Right rail ────────────────────────────────────────────────────────────────

function MyProjectsRail({ projects }: { projects: MyProject[] }) {
  if (projects.length === 0) return null;
  return (
    <RailCard id="my-projects" icon={FolderKanban} accent="#0a76b9" title="My projects" aside={
      <span className="font-sans text-[11px] text-pen-subtle">{projects.length}</span>
    }>
      {projects.map((p) => (
        <Link
          key={p.id}
          href={`/projects/${p.slug}`}
          className="group flex items-center gap-2.5 border-b border-pen-card-border/40 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-pen-surface/60"
        >
          <span className="block size-[8px] shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] font-medium text-pen-foreground group-hover:text-pen-blue">
            {p.name}
          </span>
          {p.openCount > 0 && (
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-pen-muted">
              {p.openCount} open
            </span>
          )}
        </Link>
      ))}
    </RailCard>
  );
}

function MyActivityRail({ activity }: { activity: ActivityItem[] }) {
  if (activity.length === 0) return null;
  return (
    <RailCard id="my-activity" icon={Zap} accent="#f59e0b" title="My activity">
      <div className="flex flex-col gap-2.5 px-4 py-3">
        {activity.map((a) => (
          <div key={a.id} className="flex items-start gap-2.5">
            <UserAvatar name={a.actor} avatarUrl={a.actorAvatarUrl ?? undefined} size={22} />
            <div className="min-w-0 flex-1">
              <p className="font-sans text-[11.5px] leading-[1.5] text-pen-muted">
                <span className="font-semibold text-pen-foreground">{a.actor}</span> {a.action}
              </p>
              <p className="font-sans text-[10.5px] text-pen-subtle">{a.timestamp}</p>
            </div>
          </div>
        ))}
      </div>
    </RailCard>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export function HomeDashboard({ initialData }: { initialData?: HomeDashboardData }) {
  const userName = useAuthStore((s) => s.user?.name ?? "");
  const firstName = userName.split(" ")[0] || userName;
  const timeGreeting = useLondonGreeting();

  const { data, isPending } = useQuery<HomeDashboardData>({
    queryKey: ["dashboard", "home"],
    queryFn: () => fetch("/api/dashboard/home").then((r) => r.json()),
    staleTime: 30_000,
    initialData,
    initialDataUpdatedAt: initialData ? Date.now() : undefined,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-6 px-4 py-6 sm:px-6 xl:px-8">
        {/* Briefing band */}
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              {userName ? (
                <h1 className="pen-text-display">
                  {timeGreeting}, {firstName}.
                </h1>
              ) : (
                <h1 className="pen-text-display">{timeGreeting}.</h1>
              )}
              <p className="mt-1.5 font-sans text-[13px] leading-relaxed text-pen-muted">
                {data ? buildDigest(data.metrics) : "Loading your day…"}
              </p>
            </div>
            <DualClock hideBangladesh className="shrink-0 justify-end" />
          </div>

          {data && (
            <div className={cn(
              "grid grid-cols-2 gap-3",
              data.metrics.qaTimeTodaySecs > 0 ? "lg:grid-cols-5" : "lg:grid-cols-4",
            )}>
              <MetricCard
                label="Open" value={data.metrics.open} color="#0a76b9"
                sub="assigned to you" href="/tasks"
              />
              <MetricCard
                label="Overdue" value={data.metrics.overdue} color="#ef4444"
                sub={data.metrics.overdue > 0 ? "past due date" : "nothing late"}
                href="/tasks"
              />
              <MetricCard
                label="Due this week" value={data.metrics.dueThisWeek} color="#f59e0b"
                sub={data.metrics.dueThisWeek > 0 ? "coming up" : "clear this week"}
                href="/tasks"
              />
              <MetricCard
                label="Dev time today" value={data.metrics.timeTodaySecs}
                display={data.metrics.timeToday} color="#10b981" sub="development"
                href="/time"
              />
              {data.metrics.qaTimeTodaySecs > 0 && (
                <MetricCard
                  label="QA time today" value={data.metrics.qaTimeTodaySecs}
                  display={data.metrics.qaTimeToday} color="#0d9488" sub="testing"
                  href="/time"
                />
              )}
            </div>
          )}
        </header>

        {isPending && !data ? (
          <HomeDashboardSectionsSkeleton />
        ) : data ? (
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-7">
            <div className="flex min-w-0 flex-col gap-6">
              <AttentionCard attention={data.attention} />
            </div>
            <div className="flex min-w-0 flex-col gap-5 xl:sticky xl:top-5 xl:max-h-[calc(100vh-2.5rem)] xl:overflow-y-auto xl:pb-1">
              <MyProjectsRail projects={data.projects} />
              <MyActivityRail activity={data.activity} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
