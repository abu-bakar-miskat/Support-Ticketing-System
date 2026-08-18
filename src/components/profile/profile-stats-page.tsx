"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  MessageSquare,
  Activity,
  GitPullRequest,
  X,
  ArrowRightLeft,
  UserCheck,
  Paperclip,
  AtSign,
  ArrowRight,
  Users,
  Globe,
  Trash2,
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
  qaOpen: number;
  qaDone: number;
  hasQaAssignment: boolean;
};
type TimeLogged = {
  developmentSecs: number;
  qaSecs: number;
  developmentLabel: string;
  qaLabel: string;
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
    color: "text-pen-blue",
    bg: "bg-pen-blue/10",
    verb: "Changed status",
  },
  ASSIGNED: {
    Icon: UserCheck,
    color: "text-pen-green",
    bg: "bg-pen-green/10",
    verb: "Assigned",
  },
  COMMENT_ADDED: {
    Icon: MessageSquare,
    color: "text-pen-purple",
    bg: "bg-pen-purple/10",
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
    color: "text-pen-red",
    bg: "bg-pen-red/10",
    verb: "Mentioned",
  },
  TICKET_DELETED: {
    Icon: Trash2,
    color: "text-pen-red",
    bg: "bg-pen-red/10",
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
  | "created"
  | "qaOpen"
  | "qaDone";
const STAT_LABELS: Record<StatKey, string> = {
  total: "All tickets",
  completed: "Completed",
  inProgress: "In progress",
  overdue: "Overdue",
  blocked: "Blocked",
  review: "In review",
  created: "Created",
  qaOpen: "QA open",
  qaDone: "QA done",
};

function TicketSlideOver({
  statKey,
  tickets,
  onClose,
}: {
  statKey: StatKey;
  tickets: TicketSummary[];
  onClose: () => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-40 pen-overlay-backdrop"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[400px] flex-col border-l border-pen-card-border bg-pen-card shadow-2xl animate-in slide-in-from-right duration-250">
        <div className="flex items-center justify-between border-b border-pen-card-border px-4 py-3">
          <div>
            <h2 className="font-sans text-[14px] font-semibold text-pen-foreground">
              {STAT_LABELS[statKey]}
            </h2>
            <p className="font-sans text-[11.5px] text-pen-subtle">
              {tickets.length} ticket{tickets.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-md text-pen-subtle hover:bg-pen-surface hover:text-pen-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {tickets.length === 0 ? (
            <p className="py-12 text-center font-sans text-[13px] text-pen-subtle">
              No tickets
            </p>
          ) : (
            tickets.map((t) => {
              const ov = !t.isComplete && t.dueDate && new Date(t.dueDate) < new Date();
              return (
                <Link
                  key={t.id}
                  href={`/tickets/${t.id}`}
                  onClick={onClose}
                  className="group flex items-start gap-2.5 border-b border-pen-card-border px-4 py-3 transition-colors hover:bg-pen-surface"
                >
                  <span
                    className="mt-2 size-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor: PRIORITY_COLOR[t.priority] ?? "#94a3b8",
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[11.5px] font-semibold text-pen-id">
                        {t.humanId}
                      </span>
                      {t.department && t.isOutsideContribution && (
                        <span className="rounded bg-amber-500/10 px-1.5 py-px font-sans text-[11.5px] text-amber-700 dark:text-amber-400">
                          {t.department.name}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 font-sans text-[13px] text-pen-foreground group-hover:text-pen-blue leading-snug">
                      {t.title}
                    </p>
                    <p className="mt-0.5 font-sans text-[11.5px] text-pen-subtle">
                      {t.status}
                      {t.project && ` · ${t.project.name}`}
                      {ov && (
                        <span className="ml-1 font-semibold text-pen-red">
                          · Overdue
                        </span>
                      )}
                    </p>
                  </div>
                  <ArrowRight className="mt-1.5 size-3.5 shrink-0 text-pen-subtle" />
                </Link>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

// ── Small UI pieces ────────────────────────────────────────────────────────────

function MetricButton({
  label,
  value,
  hint,
  accent,
  onClick,
  active,
}: {
  label: string;
  value: number;
  hint?: string;
  accent?: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center gap-0.5 rounded-lg border px-3 py-3 text-center transition-colors",
        active
          ? "border-pen-blue bg-pen-blue-tint"
          : "border-pen-card-border bg-pen-card hover:border-pen-blue/30",
      )}
    >
      <span
        className={cn(
          "font-sans text-[22px] font-bold leading-none tabular-nums",
          accent ?? "text-pen-foreground",
        )}
      >
        {value}
      </span>
      <span className="font-sans text-[11.5px] font-semibold text-pen-foreground">
        {label}
      </span>
      {hint && (
        <span className="font-sans text-[11.5px] text-pen-subtle">{hint}</span>
      )}
    </button>
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
            <DepartmentIcon className="size-3 shrink-0 text-pen-blue" />
          )}
          <span className="truncate font-sans text-[13px] text-pen-foreground">
            {label}
          </span>
          {isOutside && (
            <span className="shrink-0 font-sans text-[11.5px] text-amber-600 dark:text-amber-400">
              cross-dept
            </span>
          )}
        </div>
        <span className="shrink-0 font-sans text-[12px] text-pen-muted">
          {done}/{total} done
          {overdue ? (
            <span className="ml-1.5 text-pen-red">{overdue} overdue</span>
          ) : null}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-pen-surface">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            isOutside ? "bg-amber-500" : "bg-pen-green",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {((created ?? 0) > 0 || (loggedSecs ?? 0) > 0) && (
        <div className="flex items-center gap-2.5 font-sans text-[11px] text-pen-subtle">
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
    <div className="flex w-full flex-col border-t border-pen-card-border lg:h-full lg:w-[300px] lg:shrink-0 lg:border-l lg:border-t-0">
      <div className="shrink-0 border-b border-pen-card-border px-4 py-3">
        <p className="font-sans text-[13px] font-semibold text-pen-foreground">
          Recent activity
        </p>
        <p className="font-sans text-[11.5px] text-pen-subtle">Last 7 days</p>
      </div>
      <div className="max-h-[min(420px,50vh)] overflow-y-auto lg:max-h-none lg:flex-1">
        {recent.length === 0 ? (
          <p className="py-10 text-center font-sans text-[12px] text-pen-subtle">
            No recent activity
          </p>
        ) : (
          recent.map((a) => {
            const cfg = ACTION_CONFIG[a.action] ?? {
              Icon: Activity,
              color: "text-pen-subtle",
              bg: "bg-pen-surface",
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
                  <p className="font-sans text-[12px] font-semibold text-pen-foreground">
                    {headline}
                  </p>
                  {a.ticketHumanId && (
                    <p className="mt-0.5 truncate font-sans text-[11.5px] text-pen-muted">
                      <span className="font-mono text-pen-id">
                        {a.ticketHumanId}
                      </span>
                      {a.ticketTitle && ` · ${a.ticketTitle}`}
                    </p>
                  )}
                  <p className="mt-0.5 font-sans text-[11.5px] text-pen-subtle">
                    {timeAgo(new Date(a.createdAt))}
                  </p>
                </div>
              </div>
            );

            return a.ticketId ? (
              <Link
                key={a.id}
                href={`/tickets/${a.ticketId}`}
                className="block border-b border-pen-card-border px-4 py-3 transition-colors hover:bg-pen-surface"
              >
                {inner}
              </Link>
            ) : (
              <div
                key={a.id}
                className="border-b border-pen-card-border px-4 py-3"
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
  if (viewingOther) parts.push("Activity overview");
  else if (isOwnProfile) parts.push("Your activity");

  if (stats.urgentTotal > 0) {
    parts.push(`${stats.urgentCompleted}/${stats.urgentTotal} urgent tasks done`);
  }
  if (stats.onTimeTotal > 0) {
    parts.push(`${stats.onTimeRate}% on time`);
  } else if (stats.avgCompletionDays !== null) {
    parts.push(`avg ${stats.avgCompletionDays}d to complete`);
  }
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
  const [activeSlide, setSlide] = useState<StatKey | null>(null);

  const {
    profile,
    stats,
    timeLogged = {
      developmentSecs: 0,
      qaSecs: 0,
      developmentLabel: "0h",
      qaLabel: "0h",
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

  return (
    <>
      {activeSlide && (
        <TicketSlideOver
          statKey={activeSlide}
          tickets={tickets[activeSlide] ?? []}
          onClose={() => setSlide(null)}
        />
      )}

      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <div className="pen-page-header shrink-0 border-b border-pen-card-border bg-pen-card">
          <div className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <AvatarVisual
                name={profile.name}
                avatarUrl={profile.avatarUrl}
                size={40}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h1 className="pen-text-page-title">
                    {isOwnProfile ? "My profile" : profile.name}
                  </h1>
                  {!isOwnProfile && (
                    <span className="rounded bg-pen-surface px-1.5 py-px font-sans text-[11.5px] capitalize text-pen-muted">
                      {profile.role}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 pen-text-page-desc">
                  {profileSubtitle(stats, isOwnProfile, viewingOther)}
                </p>
                {(profile.subDepartmentName || profile.homeDepartmentNames.length > 0) && (
                  <p className="mt-1 pen-text-page-desc text-pen-subtle">
                    {profile.homeDepartmentNames.length > 0 &&
                      profile.homeDepartmentNames.join(", ")}
                    {profile.subDepartmentName &&
                      (profile.homeDepartmentNames.length > 0
                        ? ` · ${profile.subDepartmentName}`
                        : profile.subDepartmentName)}
                  </p>
                )}
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

        <div className="flex flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <div className="pen-page-pad flex flex-col gap-4 lg:flex-1 lg:overflow-y-auto">
            {/* Ticket counts — tap to see list */}
            <div className="flex flex-wrap gap-2">
              <MetricButton
                label="Assigned"
                value={stats.total}
                onClick={() => setSlide("total")}
                active={activeSlide === "total"}
              />
              <MetricButton
                label="Done"
                value={stats.completed}
                hint={`${stats.completionRate}%`}
                accent="text-pen-green"
                onClick={() => setSlide("completed")}
                active={activeSlide === "completed"}
              />
              <MetricButton
                label="In progress"
                value={stats.inProgress}
                onClick={() => setSlide("inProgress")}
                active={activeSlide === "inProgress"}
              />
              <MetricButton
                label="Overdue"
                value={stats.overdue}
                accent={stats.overdue > 0 ? "text-pen-red" : undefined}
                onClick={() => setSlide("overdue")}
                active={activeSlide === "overdue"}
              />
              <MetricButton
                label="Blocked"
                value={stats.blocked}
                accent={stats.blocked > 0 ? "text-pen-red" : undefined}
                onClick={() => setSlide("blocked")}
                active={activeSlide === "blocked"}
              />
              {isManager && (
                <MetricButton
                  label="In review"
                  value={stats.review}
                  onClick={() => setSlide("review")}
                  active={activeSlide === "review"}
                />
              )}
              <MetricButton
                label="Created"
                value={stats.created}
                onClick={() => setSlide("created")}
                active={activeSlide === "created"}
              />
              {stats.hasQaAssignment && (
                <>
                  <MetricButton
                    label="QA open"
                    value={stats.qaOpen}
                    accent="text-teal-700 dark:text-teal-400"
                    onClick={() => setSlide("qaOpen")}
                    active={activeSlide === "qaOpen"}
                  />
                  <MetricButton
                    label="QA done"
                    value={stats.qaDone}
                    accent="text-teal-600 dark:text-teal-400"
                    onClick={() => setSlide("qaDone")}
                    active={activeSlide === "qaDone"}
                  />
                </>
              )}
            </div>

            {/* Time logged — development and QA kept separate */}
            {(timeLogged.developmentSecs > 0 ||
              (stats.hasQaAssignment && timeLogged.qaSecs > 0)) && (
              <div
                className={cn(
                  "grid grid-cols-1 gap-3",
                  timeLogged.developmentSecs > 0 &&
                    stats.hasQaAssignment &&
                    timeLogged.qaSecs > 0
                    ? "sm:grid-cols-2"
                    : "sm:grid-cols-1",
                )}
              >
                {timeLogged.developmentSecs > 0 && (
                  <div className="rounded-xl border border-pen-card-border bg-pen-card px-4 py-3.5">
                    <div className="mb-1.5 flex items-center gap-2">
                      <Clock className="size-3.5 text-pen-blue" />
                      <p className="font-sans text-[11.5px] font-semibold tracking-[0.8px] text-pen-subtle">
                        DEVELOPMENT TIME
                      </p>
                    </div>
                    <p className="font-mono text-[26px] font-semibold tabular-nums text-pen-foreground">
                      {timeLogged.developmentLabel}
                    </p>
                    <p className="mt-0.5 font-sans text-[11.5px] text-pen-muted">
                      Logged as assignee in this period
                    </p>
                  </div>
                )}
                {timeLogged.qaSecs > 0 && stats.hasQaAssignment && (
                  <div className="rounded-xl border border-pen-card-border bg-pen-card px-4 py-3.5">
                    <div className="mb-1.5 flex items-center gap-2">
                      <Clock className="size-3.5 text-teal-600" />
                      <p className="font-sans text-[11.5px] font-semibold tracking-[0.8px] text-teal-700 dark:text-teal-400">
                        QA TIME
                      </p>
                    </div>
                    <p className="font-mono text-[26px] font-semibold tabular-nums text-pen-foreground">
                      {timeLogged.qaLabel}
                    </p>
                    <p className="mt-0.5 font-sans text-[11.5px] text-pen-muted">
                      Logged while testing in this period
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* GitHub contribution graph */}
            {profile.githubUsername ? (
              <ContributionHeatmap
                data={contributionsByDay}
                username={profile.githubUsername}
              />
            ) : null}

            {/* Work by department */}
            {byDepartment.length > 0 && (
              <div className="rounded-xl border border-pen-card-border bg-pen-card px-4 py-4">
                <p className="mb-3 font-sans text-[13px] font-semibold text-pen-foreground">
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
                        <div className="border-t border-pen-card-border pt-1" />
                      )}
                      <p className="font-sans text-[11.5px] text-pen-subtle">
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
              <div className="rounded-xl border border-pen-card-border bg-pen-card px-4 py-4">
                <p className="mb-3 font-sans text-[13px] font-semibold text-pen-foreground">
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
          </div>

          <ActivityPanel activities={recentActivity} />
        </div>
      </div>
    </>
  );
}
