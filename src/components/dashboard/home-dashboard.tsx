"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCircle2,
  FolderKanban,
  Inbox,
  ListTodo,
  Ticket,
  Users,
  Zap,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store";
import { UserAvatar } from "@/components/ui/user-avatar";
import { DualClock } from "@/components/dashboard/london-clock";
import { MetricCard } from "@/components/dashboard/metric-card";
import { RailCard } from "@/components/manager/rail-card";
import { DrawerLink } from "@/components/tickets/drawer-link";
import { useLondonGreeting } from "@/lib/london-time";
import { HomeDashboardSkeleton } from "@/components/skeletons/page-skeletons";

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

export type LedSubDepartmentMember = {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: string;
};

export type LedSubDepartment = {
  id: string;
  name: string;
  prefix: string;
  memberCount: number;
  openCount: number;
  unassignedCount: number;
  overdueCount: number;
  members: LedSubDepartmentMember[];
};

export type SubDeptTicket = {
  id: string;
  ref: string;
  title: string;
  priority: TaskPriority;
  status: string;
  subDepartmentName: string;
  assignee: string | null;
  createdLabel: string;
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
  };
  attention: AttentionTask[];
  projects: MyProject[];
  activity: ActivityItem[];
  ledSubDepartments: LedSubDepartment[];
  subDepartmentTickets: SubDeptTicket[];
};

const EMPTY_HOME: HomeDashboardData = {
  dateLine: "",
  metrics: {
    open: 0,
    overdue: 0,
    dueThisWeek: 0,
    inProgress: 0,
    completed: 0,
    todo: 0,
    timeTodaySecs: 0,
    timeToday: "0m",
  },
  attention: [],
  projects: [],
  activity: [],
  ledSubDepartments: [],
  subDepartmentTickets: [],
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
      className="group flex items-center gap-3 border-b border-sts-card-border/40 px-4 py-3 transition-colors last:border-b-0 hover:bg-sts-surface/60"
    >
      <span
        className="block size-[8px] shrink-0 rounded-full"
        style={{ backgroundColor: PRIORITY_COLOR[t.priority] }}
        title={t.priority}
      />
      <span className="shrink-0 font-mono text-[11.5px] font-semibold text-sts-id group-hover:text-sts-blue">
        {t.id}
      </span>
      <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] text-sts-foreground group-hover:text-sts-blue">
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
    <section className="overflow-hidden rounded-2xl border border-sts-card-border bg-sts-card shadow-sts-card">
      <div className="flex items-center gap-2.5 border-b border-sts-card-border px-4 py-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: "#ef444418" }}>
          <ListTodo className="size-3.5" style={{ color: "#ef4444" }} />
        </span>
        <span className="sts-text-card-title">Needs attention</span>
        {attention.length > 0 && (
          <span className="ml-auto rounded-full bg-sts-surface px-2 py-0.5 font-mono text-[11px] tabular-nums text-sts-muted">
            {attention.length}
          </span>
        )}
      </div>
      {attention.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <CheckCircle2 className="size-6 text-emerald-500" />
          <p className="font-sans text-[12.5px] text-sts-muted">
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
      <span className="font-sans text-[11px] text-sts-subtle">{projects.length}</span>
    }>
      {projects.map((p) => (
        <Link
          key={p.id}
          href={`/projects/${p.slug}`}
          className="group flex items-center gap-2.5 border-b border-sts-card-border/40 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-sts-surface/60"
        >
          <span className="block size-[8px] shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] font-medium text-sts-foreground group-hover:text-sts-blue">
            {p.name}
          </span>
          {p.openCount > 0 && (
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-sts-muted">
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
              <p className="font-sans text-[11.5px] leading-[1.5] text-sts-muted">
                <span className="font-semibold text-sts-foreground">{a.actor}</span> {a.action}
              </p>
              <p className="font-sans text-[10.5px] text-sts-subtle">{a.timestamp}</p>
            </div>
          </div>
        ))}
      </div>
    </RailCard>
  );
}

// ── Teams you lead (sub-manager) ──────────────────────────────────────────────

function TeamStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-lg border border-sts-card-border/70 px-2.5 py-2"
      style={{ backgroundColor: `${color}0d` }}
    >
      <span className="font-mono text-[16px] font-semibold leading-none tabular-nums" style={{ color }}>
        {value}
      </span>
      <span className="font-sans text-[10.5px] text-sts-muted">{label}</span>
    </div>
  );
}

function TeamRow({ team }: { team: LedSubDepartment }) {
  const shown = team.members.slice(0, 8);
  const extra = team.members.length - shown.length;
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded bg-sts-surface px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-sts-muted">
          {team.prefix}
        </span>
        <Link
          href="/board"
          className="min-w-0 flex-1 truncate font-sans text-[13px] font-semibold text-sts-foreground hover:text-sts-blue"
        >
          {team.name}
        </Link>
        <span className="shrink-0 font-sans text-[11px] text-sts-subtle">
          {team.memberCount} member{team.memberCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <TeamStat label="Open" value={team.openCount} color="#0a76b9" />
        <TeamStat label="Unassigned" value={team.unassignedCount} color="#f59e0b" />
        <TeamStat label="Overdue" value={team.overdueCount} color="#ef4444" />
      </div>
      {shown.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {shown.map((m) => (
            <span
              key={m.id}
              title={m.role === "sub_manager" ? `${m.name} · Lead` : m.name}
              className="inline-flex"
            >
              <UserAvatar name={m.name} avatarUrl={m.avatarUrl ?? undefined} size={22} />
            </span>
          ))}
          {extra > 0 && (
            <span className="font-sans text-[11px] text-sts-subtle">+{extra}</span>
          )}
        </div>
      )}
    </div>
  );
}

function TeamsYouLeadCard({
  teams,
  showEmpty,
}: {
  teams: LedSubDepartment[];
  showEmpty?: boolean;
}) {
  if (teams.length === 0 && !showEmpty) return null;
  return (
    <section className="overflow-hidden rounded-2xl border border-sts-card-border bg-sts-card shadow-sts-card">
      <div className="flex items-center gap-2.5 border-b border-sts-card-border px-4 py-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: "#0a76b918" }}>
          <Users className="size-3.5" style={{ color: "#0a76b9" }} />
        </span>
        <span className="sts-text-card-title">Teams you lead</span>
        <span className="ml-auto rounded-full bg-sts-surface px-2 py-0.5 font-mono text-[11px] tabular-nums text-sts-muted">
          {teams.length}
        </span>
      </div>
      <div className="divide-y divide-sts-card-border/60">
        {teams.length === 0 ? (
          <p className="px-4 py-5 font-sans text-[13px] text-sts-muted">
            No teams assigned yet.
          </p>
        ) : (
          teams.map((team) => <TeamRow key={team.id} team={team} />)
        )}
      </div>
    </section>
  );
}

function SubDeptTicketsCard({ tickets }: { tickets: SubDeptTicket[] }) {
  if (tickets.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-2xl border border-sts-card-border bg-sts-card shadow-sts-card">
      <div className="flex items-center gap-2.5 border-b border-sts-card-border px-4 py-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: "#7c3aed18" }}>
          <Ticket className="size-3.5" style={{ color: "#7c3aed" }} />
        </span>
        <span className="sts-text-card-title">Latest in your teams</span>
      </div>
      <div>
        {tickets.map((t) => (
          <DrawerLink
            key={t.id}
            ticketId={t.id}
            href={`/tickets/${t.id}`}
            className="group flex items-center gap-3 border-b border-sts-card-border/40 px-4 py-3 transition-colors last:border-b-0 hover:bg-sts-surface/60"
          >
            <span
              className="block size-[8px] shrink-0 rounded-full"
              style={{ backgroundColor: PRIORITY_COLOR[t.priority] }}
              title={t.priority}
            />
            <span className="shrink-0 font-mono text-[11.5px] font-semibold text-sts-id group-hover:text-sts-blue">
              {t.ref}
            </span>
            <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] text-sts-foreground group-hover:text-sts-blue">
              {t.title}
            </span>
            <span className="hidden shrink-0 items-center gap-1 font-sans text-[10.5px] text-sts-muted sm:flex">
              {t.assignee ? (
                t.assignee
              ) : (
                <>
                  <Inbox className="size-3" /> Unassigned
                </>
              )}
            </span>
            <span className="shrink-0 font-sans text-[10.5px] text-sts-subtle">{t.createdLabel}</span>
          </DrawerLink>
        ))}
      </div>
    </section>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export function HomeDashboard({ initialData }: { initialData?: HomeDashboardData }) {
  const userName = useAuthStore((s) => s.user?.name ?? "");
  const role = useAuthStore((s) => s.user?.role);
  const firstName = userName.split(" ")[0] || userName;
  const timeGreeting = useLondonGreeting();

  const { data = EMPTY_HOME, isError, refetch, isFetching, isPlaceholderData } = useQuery<HomeDashboardData>({
    queryKey: ["dashboard", "home"],
    queryFn: async () => {
      const response = await fetch("/api/dashboard/home", {
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error("Could not load dashboard");
      return response.json();
    },
    staleTime: 30_000,
    initialData,
    placeholderData: EMPTY_HOME,
    refetchOnWindowFocus: false,
  });

  // Placeholder data is all zeros — show a skeleton rather than "0 · nothing
  // late" metrics and empty sections until the real numbers arrive.
  if (isPlaceholderData && !isError) return <HomeDashboardSkeleton />;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-6 px-4 py-6 sm:px-6 xl:px-8">
        {/* Briefing band */}
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              {userName ? (
                <h1 className="sts-text-display">
                  {timeGreeting}, {firstName}.
                </h1>
              ) : (
                <h1 className="sts-text-display">{timeGreeting}.</h1>
              )}
              <p className="mt-1.5 font-sans text-[13px] leading-relaxed text-sts-muted">
                {isError
                  ? "Could not load your day."
                  : isFetching && isPlaceholderData
                    ? "Loading your day…"
                    : buildDigest(data.metrics)}
              </p>
            </div>
            <DualClock hideBangladesh className="shrink-0 justify-end" />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
                label="Time today" value={data.metrics.timeTodaySecs}
                display={data.metrics.timeToday} color="#10b981" sub="logged"
                href="/time"
              />
            </div>
        </header>

          {isError ? (
          <p className="font-sans text-[13px] text-sts-muted">
            Home stats timed out.{" "}
            <button
              type="button"
              className="font-medium text-sts-accent underline-offset-2 hover:underline"
              onClick={() => void refetch()}
            >
              Try again
            </button>
          </p>
        ) : null}

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-7">
            <div className="flex min-w-0 flex-col gap-6">
              <TeamsYouLeadCard
                teams={data.ledSubDepartments}
                showEmpty={role === "sub_manager"}
              />
              <AttentionCard attention={data.attention} />
              <SubDeptTicketsCard tickets={data.subDepartmentTickets} />
            </div>
            <div className="flex min-w-0 flex-col gap-5 xl:sticky xl:top-5 xl:max-h-[calc(100vh-2.5rem)] xl:overflow-y-auto xl:pb-1">
              <MyProjectsRail projects={data.projects} />
              <MyActivityRail activity={data.activity} />
            </div>
          </div>
      </div>
    </div>
  );
}
