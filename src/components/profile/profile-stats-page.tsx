"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  MessageSquare,
  Activity,
  GitPullRequest,
  ArrowRightLeft,
  UserCheck,
  Paperclip,
  AtSign,
  ArrowRight,
  Users,
  Globe,
  Trash2,
  Inbox,
  CircleDot,
  CalendarClock,
  Ban,
  Plus,
  CalendarDays,
  Mail,
} from "lucide-react";
import { DepartmentIcon } from "@/components/icons/department-icon";
import { cn } from "@/lib/utils";
import { AvatarVisual } from "@/components/ui/user-avatar";
import { ContributionHeatmap } from "@/components/profile/contribution-heatmap";
import type { ContributionCalendar } from "@/lib/profile/contribution-buckets";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { timeAgo } from "@/lib/format";

// ── Types ──────────────────────────────────────────────────────────────────────

type TicketSummary = {
  id: string;
  humanId: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  storyPoints: number | null;
  project: { id: string; name: string; color: string | null } | null;
  assignee: { name: string; avatarUrl: string | null } | null;
  department: { id: string; name: string } | null;
  isOutsideContribution: boolean;
  isComplete: boolean;
};
type Stats = {
  total: number;
  completed: number;
  inProgress: number;
  overdue: number;
  blocked: number;
  review: number;
  created: number;
  comments: number;
  activities: number;
  completionRate: number;
  onTimeRate: number;
  onTimeCompleted: number;
  onTimeTotal: number;
  urgentRate: number;
  urgentTotal: number;
  urgentCompleted: number;
  projectCount: number;
  avgCompletionDays: number | null;
  avgCycleDays: number | null;
  homeContributions: number;
  outsideContributions: number;
};
type TimeLogged = {
  totalSecs: number;
  totalLabel: string;
};
type DeptContribution = {
  departmentId: string;
  departmentName: string;
  isHome: boolean;
  total: number;
  completed: number;
  overdue: number;
  storyPoints: number;
  created: number;
  loggedSecs: number;
};
type ProjectStat = {
  id: string;
  name: string;
  color: string | null;
  total: number;
  completed: number;
  overdue: number;
  storyPoints: number;
};
type Person = { id: string; name: string; avatarUrl: string | null };
type ActivityMeta = {
  from: string | null;
  to: string | null;
  toName: string | null;
  fromName: string | null;
  fileName: string | null;
};
type ActivityItem = {
  id: string;
  action: string;
  ticketId: string | null;
  ticketTitle: string | null;
  ticketHumanId: string | null;
  createdAt: string;
  meta: ActivityMeta;
};
type ProfileData = {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string | null;
  subDepartmentName: string | null;
  memberSince: string;
  homeDepartmentNames: string[];
  githubUsername: string | null;
};
type FilterProject = { id: string; name: string; color: string | null };
type ApiResponse = {
  profile: ProfileData;
  stats: Stats;
  timeLogged: TimeLogged;
  tickets: Record<string, TicketSummary[]>;
  byPriority: Record<string, number>;
  byProject: ProjectStat[];
  byDepartment: DeptContribution[];
  activityByDay: Record<string, number>;
  contributionsByDay: ContributionCalendar;
  recentActivity: ActivityItem[];
  projectsForFilter: FilterProject[];
  people: Person[];
  isManager: boolean;
  dateRange: { from: string; to: string };
  isOwnProfile: boolean;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIORITY_COLOR: Record<string, string> = {
  Urgent: "#ff4500",
  Critical: "#dc2626",
  High: "#f97316",
  Medium: "#ec4899",
  Low: "#22c55e",
};

type ActionConfig = {
  Icon: React.ElementType;
  color: string;
  bg: string;
  verb: string;
};
const ACTION_CONFIG: Record<string, ActionConfig> = {
  STATUS_CHANGED: {
    Icon: ArrowRightLeft,
    color: "text-sts-blue",
    bg: "bg-sts-blue/10",
    verb: "Changed status",
  },
  ASSIGNED: {
    Icon: UserCheck,
    color: "text-sts-green",
    bg: "bg-sts-green/10",
    verb: "Assigned",
  },
  COMMENT_ADDED: {
    Icon: MessageSquare,
    color: "text-sts-purple",
    bg: "bg-sts-purple/10",
    verb: "Commented",
  },
  ATTACHMENT_ADDED: {
    Icon: Paperclip,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    verb: "Added file",
  },
  MENTION: {
    Icon: AtSign,
    color: "text-sts-red",
    bg: "bg-sts-red/10",
    verb: "Mentioned",
  },
  TICKET_DELETED: {
    Icon: Trash2,
    color: "text-sts-red",
    bg: "bg-sts-red/10",
    verb: "Deleted ticket",
  },
};

// ── Ticket slide-over ─────────────────────────────────────────────────────────

type StatKey =
  | "total"
  | "completed"
  | "inProgress"
  | "overdue"
  | "blocked"
  | "review"
  | "created";
const STAT_LABELS: Record<StatKey, string> = {
  total: "All tickets",
  completed: "Completed",
  inProgress: "In progress",
  overdue: "Overdue",
  blocked: "Blocked",
  review: "In review",
  created: "Created",
};

function TicketList({
  statKey,
  tickets,
}: {
  statKey: StatKey;
  tickets: TicketSummary[];
}) {
  return (
    <div className="flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-xl border border-sts-card-border bg-sts-card">
      <div className="flex shrink-0 items-baseline justify-between gap-3 border-b border-sts-card-border px-4 py-3">
        <h2 className="font-sans text-[14px] font-semibold text-sts-foreground">
          {STAT_LABELS[statKey]}
        </h2>
        <p className="font-sans text-[12px] text-sts-subtle">
          {tickets.length} ticket{tickets.length !== 1 ? "s" : ""}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tickets.length === 0 ? (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center px-6 py-12 text-center">
            <p className="font-sans text-[14px] font-medium text-sts-foreground">
              {statKey === "total" ? "No assigned tickets" : `No ${STAT_LABELS[statKey].toLowerCase()} tickets`}
            </p>
            <p className="mt-1 max-w-[280px] font-sans text-[13px] leading-relaxed text-sts-subtle">
              Nothing in this period matches. Try a longer range, or pick another status above.
            </p>
          </div>
        ) : (
          tickets.map((t) => {
            const ov = !t.isComplete && t.dueDate && new Date(t.dueDate) < new Date();
            return (
              <Link
                key={t.id}
                href={`/tickets/${t.id}`}
                className="group flex items-start gap-2.5 border-b border-sts-card-border px-4 py-3 transition-colors last:border-b-0 hover:bg-sts-surface"
              >
                <span
                  className="mt-2 size-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: PRIORITY_COLOR[t.priority] ?? "#94a3b8",
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11.5px] font-semibold text-sts-id">
                      {t.humanId}
                    </span>
                    {t.department && t.isOutsideContribution && (
                      <span className="rounded bg-amber-500/10 px-1.5 py-px font-sans text-[11.5px] text-amber-700 dark:text-amber-400">
                        {t.department.name}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 font-sans text-[13px] leading-snug text-sts-foreground group-hover:text-sts-blue">
                    {t.title}
                  </p>
                  <p className="mt-0.5 font-sans text-[11.5px] text-sts-subtle">
                    {t.status}
                    {t.project && ` · ${t.project.name}`}
                    {ov && (
                      <span className="ml-1 font-semibold text-sts-red">
                        · Overdue
                      </span>
                    )}
                  </p>
                </div>
                <ArrowRight className="mt-1.5 size-3.5 shrink-0 text-sts-subtle" />
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Small UI pieces ────────────────────────────────────────────────────────────

function MetricTile({
  label,
  value,
  hint,
  Icon,
  iconClass,
  iconBg,
  accent,
  onClick,
  active,
}: {
  label: string;
  value: number;
  hint?: string;
  Icon: React.ElementType;
  iconClass: string;
  iconBg: string;
  accent?: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-w-0 flex-col items-start gap-2 bg-sts-card px-3.5 py-3 text-left transition-colors",
        "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sts-blue",
        active
          ? "bg-sts-blue-tint shadow-[inset_0_-2px_0_0_var(--sts-blue)]"
          : "hover:bg-sts-surface",
      )}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-lg",
            iconBg,
          )}
        >
          <Icon className={cn("size-3.5", iconClass)} />
        </span>
        {hint && (
          <span className="rounded-full bg-sts-surface px-1.5 py-0.5 font-sans text-[11px] font-semibold tabular-nums text-sts-muted">
            {hint}
          </span>
        )}
      </div>
      <div>
        <span
          className={cn(
            "block font-sans text-[22px] font-bold leading-none tabular-nums",
            accent ?? "text-sts-foreground",
          )}
        >
          {value}
        </span>
        <span className="mt-1 block font-sans text-[12px] font-medium text-sts-muted">
          {label}
        </span>
      </div>
    </button>
  );
}

function MiniStat({
  label,
  value,
  sub,
  pct,
  barClass,
}: {
  label: string;
  value: string;
  sub?: string;
  pct?: number;
  barClass?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.6px] text-sts-subtle">
        {label}
      </p>
      <p className="font-sans text-[20px] font-bold leading-none tabular-nums text-sts-foreground">
        {value}
      </p>
      {pct !== undefined ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-sts-surface">
          <div
            className={cn("h-full rounded-full transition-all", barClass ?? "bg-sts-blue")}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
      ) : (
        <div className="h-1.5" />
      )}
      {sub && (
        <p className="font-sans text-[11px] text-sts-subtle">{sub}</p>
      )}
    </div>
  );
}

function shortDuration(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.round((totalSecs % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

function ProgressRow({
  label,
  done,
  total,
  overdue,
  isOutside,
  created,
  loggedSecs,
}: {
  label: string;
  done: number;
  total: number;
  overdue?: number;
  isOutside?: boolean;
  created?: number;
  loggedSecs?: number;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {isOutside ? (
            <Globe className="size-3 shrink-0 text-amber-500" />
          ) : (
            <DepartmentIcon className="size-3 shrink-0 text-sts-blue" />
          )}
          <span className="truncate font-sans text-[13px] text-sts-foreground">
            {label}
          </span>
          {isOutside && (
            <span className="shrink-0 font-sans text-[11.5px] text-amber-600 dark:text-amber-400">
              cross-dept
            </span>
          )}
        </div>
        <span className="shrink-0 font-sans text-[12px] text-sts-muted">
          {done}/{total} done
          {overdue ? (
            <span className="ml-1.5 text-sts-red">{overdue} overdue</span>
          ) : null}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-sts-surface">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            isOutside ? "bg-amber-500" : "bg-sts-green",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {((created ?? 0) > 0 || (loggedSecs ?? 0) > 0) && (
        <div className="flex items-center gap-2.5 font-sans text-[11px] text-sts-subtle">
          {(created ?? 0) > 0 && <span>{created} created</span>}
          {(loggedSecs ?? 0) > 0 && <span>{shortDuration(loggedSecs!)} logged</span>}
        </div>
      )}
    </div>
  );
}

function ActivityPanel({ activities }: { activities: ActivityItem[] }) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000);
  const recent = activities
    .filter((a) => new Date(a.createdAt) >= sevenDaysAgo)
    .slice(0, 15);

  return (
    <div className="flex w-full flex-col border-t border-sts-card-border lg:h-full lg:w-[300px] lg:shrink-0 lg:border-l lg:border-t-0">
      <div className="shrink-0 border-b border-sts-card-border px-4 py-3">
        <p className="font-sans text-[13px] font-semibold text-sts-foreground">
          Recent activity
        </p>
        <p className="font-sans text-[11.5px] text-sts-subtle">Last 7 days</p>
      </div>
      <div className="flex max-h-[min(420px,50vh)] flex-col overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
        {recent.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
            <p className="font-sans text-[13px] font-medium text-sts-foreground">
              No recent activity
            </p>
            <p className="mt-1 font-sans text-[12px] leading-relaxed text-sts-subtle">
              Comments, status changes, and assignments from the last 7 days show up here.
            </p>
          </div>
        ) : (
          recent.map((a) => {
            const cfg = ACTION_CONFIG[a.action] ?? {
              Icon: Activity,
              color: "text-sts-subtle",
              bg: "bg-sts-surface",
              verb: a.action,
            };

            let headline = cfg.verb;
            if (a.action === "STATUS_CHANGED" && a.meta.to) {
              headline = `Moved to ${a.meta.to}`;
            } else if (a.action === "ASSIGNED" && a.meta.toName) {
              headline = `Assigned to ${a.meta.toName}`;
            } else if (a.action === "COMMENT_ADDED") {
              headline = "Commented";
            }

            const inner = (
              <div className="flex items-start gap-2.5">
                <div
                  className={cn(
                    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                    cfg.bg,
                  )}
                >
                  <cfg.Icon className={cn("size-3.5", cfg.color)} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-sans text-[12px] font-semibold text-sts-foreground">
                    {headline}
                  </p>
                  {a.ticketHumanId && (
                    <p className="mt-0.5 truncate font-sans text-[11.5px] text-sts-muted">
                      <span className="font-mono text-sts-id">
                        {a.ticketHumanId}
                      </span>
                      {a.ticketTitle && ` · ${a.ticketTitle}`}
                    </p>
                  )}
                  <p className="mt-0.5 font-sans text-[11.5px] text-sts-subtle">
                    {timeAgo(new Date(a.createdAt))}
                  </p>
                </div>
              </div>
            );

            return a.ticketId ? (
              <Link
                key={a.id}
                href={`/tickets/${a.ticketId}`}
                className="block border-b border-sts-card-border px-4 py-3 transition-colors hover:bg-sts-surface"
              >
                {inner}
              </Link>
            ) : (
              <div
                key={a.id}
                className="border-b border-sts-card-border px-4 py-3"
              >
                {inner}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Filters ────────────────────────────────────────────────────────────────────

const DAY_OPTIONS = [
  { value: "0", label: "Today" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
] as const;

function ProfileStatsFilters({
  people,
  projects,
  currentUserId,
  isPrivileged,
}: {
  people: Person[];
  projects: FilterProject[];
  currentUserId: string;
  isPrivileged: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  const userOptions = people.filter((p) => p.id !== currentUserId);
  const selectedUserId = searchParams.get("userId") ?? currentUserId;
  const selectedProjectId = searchParams.get("projectId") ?? "";
  const selectedDays = searchParams.get("days") ?? "30";

  const memberOptions = [
    { value: currentUserId, label: "My profile" },
    ...userOptions.map((p) => ({ value: p.id, label: p.name })),
  ];
  const projectOptions = [
    { value: "", label: "All projects" },
    ...projects.map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <div className="flex shrink-0 flex-nowrap items-center gap-2">
      {isPrivileged && userOptions.length > 0 && (
        <SearchableSelect
          value={selectedUserId}
          onChange={(v) => setParam("userId", v === currentUserId ? "" : v)}
          options={memberOptions}
          aria-label="View profile"
          icon={Users}
          searchable
          size="sm"
          className="min-w-[140px]"
        />
      )}
      {projects.length > 0 && (
        <SearchableSelect
          value={selectedProjectId}
          onChange={(v) => setParam("projectId", v)}
          options={projectOptions}
          aria-label="Filter by project"
          searchable
          size="sm"
          className="min-w-[130px]"
        />
      )}
      <SearchableSelect
        value={selectedDays}
        onChange={(v) => setParam("days", v === "30" ? "" : v)}
        options={DAY_OPTIONS.map((d) => ({ value: d.value, label: d.label }))}
        aria-label="Time period"
        searchable
        size="sm"
        className="min-w-[130px]"
      />
    </div>
  );
}

function profileSubtitle(
  stats: Stats,
  isOwnProfile: boolean,
  viewingOther: boolean,
) {
  if (stats.total === 0) {
    return "No assigned tickets in this period.";
  }

  const parts: string[] = [];
  parts.push(viewingOther ? "Activity overview" : "Your activity");
  parts.push(
    `${stats.completed} of ${stats.total} ticket${stats.total !== 1 ? "s" : ""} done`,
  );
  if (stats.projectCount > 0) {
    parts.push(`${stats.projectCount} project${stats.projectCount !== 1 ? "s" : ""}`);
  }

  return parts.join(" · ");
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function ProfileStatsPage({
  initialData,
  isPrivileged,
  currentUserId,
}: {
  initialData: ApiResponse;
  isPrivileged: boolean;
  currentUserId: string;
}) {
  const [activeSlide, setSlide] = useState<StatKey>("total");

  const {
    profile,
    stats,
    timeLogged = {
      totalSecs: 0,
      totalLabel: "0h",
    },
    tickets,
    byProject,
    byDepartment,
    contributionsByDay,
    recentActivity,
    people,
    projectsForFilter,
    isOwnProfile,
    isManager,
  } = initialData;

  const viewingOther = profile.id !== currentUserId;

  const homeDepts = byDepartment.filter((d) => d.isHome);
  const outsideDepts = byDepartment.filter((d) => !d.isHome);

  const perfStats: {
    label: string;
    value: string;
    sub?: string;
    pct?: number;
    barClass?: string;
  }[] = [];
  if (stats.total > 0) {
    perfStats.push({
      label: "Completion",
      value: `${stats.completionRate}%`,
      sub: `${stats.completed} of ${stats.total} done`,
      pct: stats.completionRate,
      barClass: "bg-sts-green",
    });
  }
  if (stats.onTimeTotal > 0) {
    perfStats.push({
      label: "On time",
      value: `${stats.onTimeRate}%`,
      sub: `${stats.onTimeCompleted} of ${stats.onTimeTotal} on time`,
      pct: stats.onTimeRate,
      barClass: "bg-sts-blue",
    });
  }
  if (stats.urgentTotal > 0) {
    perfStats.push({
      label: "Urgent done",
      value: `${stats.urgentRate}%`,
      sub: `${stats.urgentCompleted} of ${stats.urgentTotal} urgent`,
      pct: stats.urgentRate,
      barClass: "bg-sts-red",
    });
  }
  if (stats.avgCycleDays !== null) {
    perfStats.push({
      label: "Avg cycle",
      value: `${stats.avgCycleDays}d`,
      sub: "start to done",
    });
  } else if (stats.avgCompletionDays !== null) {
    perfStats.push({
      label: "Avg to done",
      value: `${stats.avgCompletionDays}d`,
      sub: "from assignment",
    });
  }
  if (timeLogged.totalSecs > 0) {
    perfStats.push({
      label: "Time logged",
      value: timeLogged.totalLabel,
      sub: "this period",
    });
  }

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <div className="sts-page-header shrink-0 border-b border-sts-card-border bg-sts-card">
          <div className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3.5">
              <AvatarVisual
                name={profile.name}
                avatarUrl={profile.avatarUrl}
                size={48}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h1 className="sts-text-page-title">
                    {isOwnProfile ? "My profile" : profile.name}
                  </h1>
                  {!isOwnProfile && (
                    <span className="rounded bg-sts-surface px-1.5 py-px font-sans text-[11.5px] capitalize text-sts-muted">
                      {profile.role}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 sts-text-page-desc">
                  {profileSubtitle(stats, isOwnProfile, viewingOther)}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-[12px] text-sts-subtle">
                  {(profile.homeDepartmentNames.length > 0 ||
                    profile.subDepartmentName) && (
                    <span className="flex items-center gap-1">
                      <DepartmentIcon className="size-3 text-sts-subtle" />
                      {[
                        ...profile.homeDepartmentNames,
                        profile.subDepartmentName,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                  {isOwnProfile && profile.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="size-3 text-sts-subtle" />
                      {profile.email}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <CalendarDays className="size-3 text-sts-subtle" />
                    Joined{" "}
                    {new Date(profile.memberSince).toLocaleDateString(undefined, {
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
            </div>
            <Suspense>
              <ProfileStatsFilters
                people={people}
                projects={projectsForFilter}
                currentUserId={currentUserId}
                isPrivileged={isPrivileged}
              />
            </Suspense>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <div className="sts-page-pad flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            {/* Ticket counts — tap a status to list those tickets below */}
            <div className="grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded-xl border border-sts-card-border bg-sts-card-border sm:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))]">
              <MetricTile
                label="Assigned"
                value={stats.total}
                Icon={Inbox}
                iconClass="text-sts-muted"
                iconBg="bg-sts-surface"
                onClick={() => setSlide("total")}
                active={activeSlide === "total"}
              />
              <MetricTile
                label="Done"
                value={stats.completed}
                hint={`${stats.completionRate}%`}
                Icon={CheckCircle2}
                iconClass="text-sts-green"
                iconBg="bg-sts-green/10"
                accent="text-sts-green"
                onClick={() => setSlide("completed")}
                active={activeSlide === "completed"}
              />
              <MetricTile
                label="In progress"
                value={stats.inProgress}
                Icon={CircleDot}
                iconClass="text-sts-blue"
                iconBg="bg-sts-blue/10"
                onClick={() => setSlide("inProgress")}
                active={activeSlide === "inProgress"}
              />
              <MetricTile
                label="Overdue"
                value={stats.overdue}
                Icon={CalendarClock}
                iconClass={stats.overdue > 0 ? "text-sts-red" : "text-sts-muted"}
                iconBg={stats.overdue > 0 ? "bg-sts-red/10" : "bg-sts-surface"}
                accent={stats.overdue > 0 ? "text-sts-red" : undefined}
                onClick={() => setSlide("overdue")}
                active={activeSlide === "overdue"}
              />
              <MetricTile
                label="Blocked"
                value={stats.blocked}
                Icon={Ban}
                iconClass={stats.blocked > 0 ? "text-sts-red" : "text-sts-muted"}
                iconBg={stats.blocked > 0 ? "bg-sts-red/10" : "bg-sts-surface"}
                accent={stats.blocked > 0 ? "text-sts-red" : undefined}
                onClick={() => setSlide("blocked")}
                active={activeSlide === "blocked"}
              />
              {isManager && (
                <MetricTile
                  label="In review"
                  value={stats.review}
                  Icon={GitPullRequest}
                  iconClass="text-sts-purple"
                  iconBg="bg-sts-purple/10"
                  onClick={() => setSlide("review")}
                  active={activeSlide === "review"}
                />
              )}
              <MetricTile
                label="Created"
                value={stats.created}
                Icon={Plus}
                iconClass="text-sts-blue"
                iconBg="bg-sts-blue/10"
                onClick={() => setSlide("created")}
                active={activeSlide === "created"}
              />
            </div>

            {/* Performance summary */}
            {perfStats.length > 0 && (
              <div className="shrink-0 rounded-xl border border-sts-card-border bg-sts-card px-4 py-4">
                <p className="mb-4 font-sans text-[13px] font-semibold text-sts-foreground">
                  Performance
                </p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {perfStats.map((s) => (
                    <MiniStat key={s.label} {...s} />
                  ))}
                </div>
              </div>
            )}

            {/* GitHub contribution graph */}
            {profile.githubUsername ? (
              <div className="shrink-0">
                <ContributionHeatmap
                  data={contributionsByDay}
                  username={profile.githubUsername}
                />
              </div>
            ) : null}

            {/* Work by department */}
            {byDepartment.length > 0 && (
              <div className="shrink-0 rounded-xl border border-sts-card-border bg-sts-card px-4 py-4">
                <p className="mb-3 font-sans text-[13px] font-semibold text-sts-foreground">
                  Work by department
                </p>
                <div className="flex flex-col gap-3">
                  {homeDepts.map((d) => (
                    <ProgressRow
                      key={d.departmentId}
                      label={d.departmentName}
                      done={d.completed}
                      total={d.total}
                      overdue={d.overdue}
                      created={d.created}
                      loggedSecs={d.loggedSecs}
                    />
                  ))}
                  {outsideDepts.length > 0 && (
                    <>
                      {homeDepts.length > 0 && (
                        <div className="border-t border-sts-card-border pt-1" />
                      )}
                      <p className="font-sans text-[11.5px] text-sts-subtle">
                        Cross-department work
                      </p>
                      {outsideDepts.map((d) => (
                        <ProgressRow
                          key={d.departmentId}
                          label={d.departmentName}
                          done={d.completed}
                          total={d.total}
                          overdue={d.overdue}
                          created={d.created}
                          loggedSecs={d.loggedSecs}
                          isOutside
                        />
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Top projects — only when useful */}
            {byProject.length > 0 && (
              <div className="shrink-0 rounded-xl border border-sts-card-border bg-sts-card px-4 py-4">
                <p className="mb-3 font-sans text-[13px] font-semibold text-sts-foreground">
                  Projects
                </p>
                <div className="flex flex-col gap-3">
                  {byProject.slice(0, 4).map((p) => (
                    <ProgressRow
                      key={p.id}
                      label={p.name}
                      done={p.completed}
                      total={p.total}
                      overdue={p.overdue}
                    />
                  ))}
                </div>
              </div>
            )}

            <TicketList
              statKey={activeSlide}
              tickets={tickets[activeSlide] ?? []}
            />
          </div>

          <ActivityPanel activities={recentActivity} />
        </div>
      </div>
    </>
  );
}
