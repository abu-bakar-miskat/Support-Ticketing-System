"use client"

import type { StatusCategory } from "@/lib/status-category";

import { Suspense } from "react";
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
  Users,
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
  category: StatusCategory;
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

// ── Small UI pieces ────────────────────────────────────────────────────────────

function MetricTile({
  label,
  value,
  hint,
  Icon,
  iconClass,
  iconBg,
  accent,
}: {
  label: string;
  value: number;
  hint?: string;
  Icon: React.ElementType;
  iconClass: string;
  iconBg: string;
  accent?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-4 bg-sts-card px-4 py-4 text-left sm:px-5 sm:py-5">
      <div className="flex w-full items-center justify-between gap-2">
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-xl",
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
            "block font-sans text-[28px] font-semibold leading-none tracking-tight tabular-nums",
            accent ?? "text-sts-foreground",
          )}
        >
          {value}
        </span>
        <span className="mt-2 block font-sans text-[12px] font-medium text-sts-muted">
          {label}
        </span>
      </div>
    </div>
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
    <div className="flex min-w-0 flex-col gap-2.5">
      <p className="font-sans text-[12px] font-medium text-sts-muted">
        {label}
      </p>
      <p className="font-sans text-[26px] font-semibold leading-none tracking-tight tabular-nums text-sts-foreground">
        {value}
      </p>
      {pct !== undefined ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-sts-surface">
          <div
            className={cn("h-full rounded-full", barClass ?? "bg-sts-blue")}
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

function ActivityPanel({ activities, asOf }: { activities: ActivityItem[]; asOf: string }) {
  const sevenDaysAgo = new Date(new Date(asOf).getTime() - 7 * 86400_000);
  const recent = activities
    .filter((a) => new Date(a.createdAt) >= sevenDaysAgo)
    .slice(0, 15);

  return (
    <div className="flex w-full flex-col border-t border-sts-card-border 2xl:h-full 2xl:w-[280px] 2xl:shrink-0 2xl:border-l 2xl:border-t-0">
      <div className="shrink-0 border-b border-sts-card-border px-4 py-3">
        <p className="font-sans text-[13px] font-semibold text-sts-foreground">
          Recent activity
        </p>
        <p className="font-sans text-[11.5px] text-sts-subtle">Last 7 days</p>
      </div>
      <div className="flex max-h-[min(420px,50vh)] flex-col overflow-y-auto 2xl:max-h-none 2xl:min-h-0 2xl:flex-1">
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
    <div className="flex shrink-0 flex-wrap items-center gap-2">
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
  slaSection,
}: {
  initialData: ApiResponse;
  isPrivileged: boolean;
  currentUserId: string;
  slaSection?: React.ReactNode;
}) {
  const {
    profile,
    stats,
    timeLogged = {
      totalSecs: 0,
      totalLabel: "0h",
    },
    contributionsByDay,
    recentActivity,
    people,
    projectsForFilter,
    isOwnProfile,
    isManager,
  } = initialData;

  const viewingOther = profile.id !== currentUserId;

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
          <div className="mx-auto flex w-full max-w-[1440px] shrink-0 flex-col gap-5 pb-5 pt-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <AvatarVisual
                name={profile.name}
                avatarUrl={profile.avatarUrl}
                size={64}
                className="ring-4 ring-sts-surface"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h1 className="font-sans text-[26px] font-semibold leading-tight tracking-[-0.7px] text-sts-foreground">
                    {isOwnProfile ? "My profile" : profile.name}
                  </h1>
                  <span className="rounded-md border border-sts-card-border bg-sts-surface px-2 py-0.5 font-sans text-[11px] font-medium capitalize text-sts-muted">
                    {profile.role.replaceAll("_", " ")}
                  </span>
                </div>
                <p className="mt-1.5 sts-text-page-desc">
                  {profileSubtitle(stats, viewingOther)}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 font-sans text-[12px] text-sts-subtle">
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
            <div className="flex flex-col gap-2 xl:items-end">
              <p className="font-sans text-[11px] font-medium text-sts-subtle">Activity period</p>
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
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto 2xl:flex-row 2xl:overflow-hidden">
          <div className="sts-page-pad flex min-w-0 flex-none flex-col gap-5 2xl:min-h-0 2xl:flex-1 2xl:overflow-y-auto">
            <div className="mx-auto flex w-full max-w-[1440px] shrink-0 flex-col gap-5">
              {/* Ticket counts */}
              <div className="grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded-2xl border border-sts-card-border bg-sts-card-border sm:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(7rem,1fr))]">
                <MetricTile
                  label="Assigned"
                  value={stats.total}
                  Icon={Inbox}
                  iconClass="text-sts-muted"
                  iconBg="bg-sts-surface"
                />
                <MetricTile
                  label="Done"
                  value={stats.completed}
                  hint={`${stats.completionRate}%`}
                  Icon={CheckCircle2}
                  iconClass="text-sts-green"
                  iconBg="bg-sts-green/10"
                  accent="text-sts-green"
                />
                <MetricTile
                  label="In progress"
                  value={stats.inProgress}
                  Icon={CircleDot}
                  iconClass="text-sts-blue"
                  iconBg="bg-sts-blue/10"
                />
                <MetricTile
                  label="Overdue"
                  value={stats.overdue}
                  Icon={CalendarClock}
                  iconClass={stats.overdue > 0 ? "text-sts-red" : "text-sts-muted"}
                  iconBg={stats.overdue > 0 ? "bg-sts-red/10" : "bg-sts-surface"}
                  accent={stats.overdue > 0 ? "text-sts-red" : undefined}
                />
                <MetricTile
                  label="Blocked"
                  value={stats.blocked}
                  Icon={Ban}
                  iconClass={stats.blocked > 0 ? "text-sts-red" : "text-sts-muted"}
                  iconBg={stats.blocked > 0 ? "bg-sts-red/10" : "bg-sts-surface"}
                  accent={stats.blocked > 0 ? "text-sts-red" : undefined}
                />
                {isManager && (
                  <MetricTile
                    label="In review"
                    value={stats.review}
                    Icon={GitPullRequest}
                    iconClass="text-sts-purple"
                    iconBg="bg-sts-purple/10"
                  />
                )}
                <MetricTile
                  label="Created"
                  value={stats.created}
                  Icon={Plus}
                  iconClass="text-sts-blue"
                  iconBg="bg-sts-blue/10"
                />
              </div>

              {/* Performance summary */}
              {perfStats.length > 0 && (
                <section aria-label="Performance overview" className="shrink-0 rounded-2xl border border-sts-card-border bg-sts-card p-5 sm:p-6">
                  <div className="mb-6">
                    <h2 className="font-sans text-[15px] font-semibold tracking-tight text-sts-foreground">Performance overview</h2>
                    <p className="mt-1 font-sans text-[12px] text-sts-subtle">Completion, delivery and time spent in the selected period.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 xl:grid-cols-5">
                    {perfStats.map((s) => (
                      <MiniStat key={s.label} {...s} />
                    ))}
                  </div>
                </section>
              )}

              {/* SLA & response times — streamed separately (slow per-ticket SLA evaluation) */}
              {slaSection}

              {/* GitHub contribution graph */}
              {profile.githubUsername ? (
                <div className="shrink-0">
                  <ContributionHeatmap
                    data={contributionsByDay}
                    username={profile.githubUsername}
                  />
                </div>
              ) : null}
            </div>
          </div>

          <ActivityPanel activities={recentActivity} asOf={initialData.dateRange.to} />
        </div>
      </div>
    </>
  );
}
