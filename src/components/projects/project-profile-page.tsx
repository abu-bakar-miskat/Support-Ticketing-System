"use client";

import { useCallback, useRef, useState, useEffect, useTransition, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useProjectDetails, projectDetailsKeys } from "@/hooks/queries/use-project-details";
import { useProjectBoardsRealtime } from "@/hooks/use-project-boards-realtime";
import { useProjectRealtime } from "@/hooks/use-project-realtime";
import { subDepartmentKeys } from "@/hooks/queries/keys";
import { getSubDepartmentStatuses } from "@/lib/api/sub-departments";
import { useProjectTab, type ProjectTab } from "@/components/projects/use-project-tab";
import { ProjectExportMenu } from "@/components/projects/project-export-menu";
import { ProjectTabPanel } from "@/components/projects/project-tab-panel";
import { ProjectSprintsTab } from "@/components/projects/project-sprints-tab";
import {
  resolveCurrentStage,
  formatStageRange,
} from "@/lib/project-lifecycle";
import { usePersistedView, VIEW_KEYS } from "@/hooks/use-persisted-view";
import type { ProjectDetailsResponse } from "@/lib/api/projects";
import { updateProjectBoards } from "@/lib/api/projects";
import { toast } from "sonner";
import {
  LayoutGrid,
  AlignJustify,
  List,
  BarChart3,
  Clock,
  CheckCircle2,
  CircleDot,
  MessageCircle,
  ArrowUpRight,
  UserPlus,
  X,
  Search,
  AlertTriangle,
  Ban,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Users,
  Activity,
  Plus,
  Loader2,
  Settings,
  Folder as FolderIcon,
  Image as ImageIcon,
  FileText as FileTextIcon,
  Film as FilmIcon,
  Code as CodeIcon,
  Link2 as Link2Icon,
  TicketCheck,
  ArrowRightLeft,
  UserCheck,
  Paperclip,
  AtSign,
  TrendingUp,
  Timer,
  Layers,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PriorityDot } from "@/components/board/priority-indicator";
import { updateAdminProject } from "@/lib/api/admin";
import { useAuthStore } from "@/store";
import { StatusPill } from "@/components/board/status-pill";
import { TagPill } from "@/components/board/tag-pill";
import {
  uiPriorityFromDb,
  normalizeStatus,
  type BoardCardData,
  type SubDepartmentStatusConfig,
  type UiPriority,
} from "@/components/board/board-types";
import { ProjectBoardPage, MODULE_ZERO_FILTER_ID, type ProjectBoardFilters } from "@/components/projects/project-board-page";
import { NewTicketModal } from "@/components/tickets/new-ticket-modal";
import { ProjectAvatarEditor } from "@/components/projects/project-avatar-editor";
import {
  ProjectModal,
  type ProjectRow as ModalProjectRow,
} from "@/components/projects/project-modal";
import {
  ProjectProfileTab,
  ProjectAssetsTab,
} from "@/components/projects/project-profile-tab";
import { avatarColorFor } from "@/lib/avatar";
import { formatTicketDue, formatDateTime, isBlockedStatus } from "@/lib/format";
import { UserAvatar } from "@/components/ui/user-avatar";
import { UserListItem, userListPickerButtonClass } from "@/components/ui/user-list-item";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { matchesUserListSearch, type UserListPerson } from "@/lib/user-list-person";
import { FilterDropdown } from "@/components/tasks/task-filter-dropdown";

// ── Types ─────────────────────────────────────────────────────────────────────

export type { ActivityItem, TicketRow } from "@/lib/api/projects";
import type {
  ActivityItem,
  TicketRow,
  ProjectMember as Member,
  ProjectSubDepartmentBoardGroup as SubDepartmentBoardGroupData,
  AddableBoardSubDepartment,
  BoardSubDepartmentSource,
} from "@/lib/api/projects";
import {
  ProjectDetailHeaderSkeleton,
  ProjectDetailSectionsSkeleton,
} from "@/components/skeletons/page-skeletons";
type Project = ProjectDetailsResponse["project"];
type Stats = ProjectDetailsResponse["stats"];
type ProjectTimeStats = ProjectDetailsResponse["timeStats"];
type StatusDist = ProjectDetailsResponse["statusDist"][number];

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRIORITY_COLOR: Record<string, string> = {
  Urgent: "#ff4500",
  Critical: "#ef4444",
  High: "#f97316",
  Medium: "#ec4899",
  Low: "#94a3b8",
};

const PRIORITY_ORDER = ["Urgent", "Critical", "High", "Medium", "Low"];

const BOARD_PRIORITY_FILTER_OPTIONS: {
  id: UiPriority;
  label: string;
  color: string;
}[] = [
  { id: "urgent", label: "Urgent", color: "#ff4500" },
  { id: "critical", label: "Critical", color: "#dc2626" },
  { id: "high", label: "High", color: "#f97316" },
  { id: "medium", label: "Medium", color: "#ec4899" },
  { id: "low", label: "Low", color: "#94a3b8" },
];

function toggleFilterSet(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function detailsToModalProject(
  project: Project,
  projectMemberUsers: UserListPerson[],
  openCount: number,
): ModalProjectRow {
  const slugPrefix = project.slug.split("-")[0]?.toUpperCase() ?? "PRJ";
  return {
    id: project.id,
    name: project.name,
    color: project.color,
    avatarUrl: project.avatarUrl ?? null,
    description: project.description,
    projectStatus: project.projectStatus,
    lifecycleStages: project.lifecycleStages,
    moduleSystemEnabled: project.moduleSystemEnabled,
    openCount,
    prefix: `${slugPrefix}-`,
    departmentId: project.departmentId,
    departmentName: project.departmentName,
    members: projectMemberUsers.map((m) => ({
      id: m.id,
      name: m.name,
      avatarColor: avatarColorFor(m.name),
      avatarUrl: m.avatarUrl ?? null,
    })),
  };
}

function formatSecs(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function timeAgo(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 86400 * 30) return `${Math.floor(secs / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function dueLabel(
  iso: string | null,
  opts: { isStatusComplete?: boolean; isBlocked?: boolean } = {},
): { label: string; urgent: boolean; overdue: boolean } | null {
  if (!iso) return null;
  const { due, dueUrgent, dueOverdue } = formatTicketDue(
    new Date(iso),
    new Date(),
    {
      isStatusComplete: opts.isStatusComplete,
      isBlocked: opts.isBlocked,
    },
  );
  if (!due) return null;
  return { label: due, urgent: dueUrgent, overdue: dueOverdue };
}

function formatMemberNames(names: string[], max = 2): string {
  if (names.length === 0) return "";
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} +${names.length - max}`;
}

function boardSubDepartmentSourceLabel(
  source: BoardSubDepartmentSource | "tickets",
  memberNames: string[],
): string {
  if (source === "department") return "Department team";
  if (source === "member") {
    const names = formatMemberNames(memberNames);
    return names ? `Assigned member · ${names}` : "Assigned member team";
  }
  return "Has tickets on this project";
}

function boardSubDepartmentSourceBadge(
  source: BoardSubDepartmentSource | "tickets",
): { label: string; className: string } {
  if (source === "department") {
    return {
      label: "Dept",
      className:
        "bg-pen-blue-tint text-pen-id dark:bg-pen-blue-tint/30",
    };
  }
  if (source === "member") {
    return {
      label: "Assigned",
      className:
        "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
    };
  }
  return {
    label: "Tickets",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <div className="pen-glass-panel flex flex-col gap-1 rounded-xl border border-pen-card-border p-4">
      <div className="flex items-center justify-between">
        <span className="pen-text-section-label">
          {label}
        </span>
        <Icon className="size-4" style={{ color: accent }} strokeWidth={1.8} />
      </div>
      <span className="font-sans text-[28px] font-bold leading-none text-pen-foreground">
        {value}
      </span>
    </div>
  );
}

function PriorityBar({ byPriority }: { byPriority: Record<string, number> }) {
  const total = Object.values(byPriority).reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  return (
    <div className="pen-glass-panel rounded-xl border border-pen-card-border p-4">
      <p className="mb-3 pen-text-section-label">
        Priority breakdown
      </p>
      <div className="flex h-2 overflow-hidden rounded-full">
        {PRIORITY_ORDER.map((p) => {
          const pct = ((byPriority[p] ?? 0) / total) * 100;
          return pct > 0 ? (
            <div
              key={p}
              style={{ width: `${pct}%`, backgroundColor: PRIORITY_COLOR[p] }}
              title={`${p}: ${byPriority[p]}`}
            />
          ) : null;
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        {PRIORITY_ORDER.filter((p) => (byPriority[p] ?? 0) > 0).map((p) => (
          <div key={p} className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: PRIORITY_COLOR[p] }}
            />
            <span className="font-sans text-[11.5px] text-pen-subtle">
              {p}{" "}
              <span className="font-semibold text-pen-foreground">
                {byPriority[p]}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusDistribution({ statusDist }: { statusDist: StatusDist[] }) {
  const total = statusDist.reduce((a, b) => a + b.count, 0);
  if (total === 0) return null;
  return (
    <div className="pen-glass-panel rounded-xl border border-pen-card-border p-4">
      <p className="mb-3 pen-text-section-label">
        Status distribution
      </p>
      <div className="flex flex-col gap-2">
        {statusDist
          .filter((s) => s.count > 0)
          .map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="min-w-[90px] truncate font-sans text-[12px] text-pen-foreground">
                {s.label}
              </span>
              <div className="flex-1 overflow-hidden rounded-full bg-pen-surface">
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: `${(s.count / total) * 100}%`,
                    backgroundColor: s.color,
                  }}
                />
              </div>
              <span className="w-6 text-right font-sans text-[11.5px] font-semibold text-pen-foreground">
                {s.count}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

type ProjectMember = UserListPerson;

function ProjectMembersSection({
  projectMembers,
  projectId,
  currentMemberIds,
  onMemberAdded,
}: {
  projectMembers: ProjectMember[];
  projectId: string;
  currentMemberIds: string[];
  onMemberAdded: (id: string, name: string) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserListPerson[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function openAdding() {
    setAdding(true);
    setQuery("");
    setSelectedIds(new Set());
    if (users.length === 0) {
      setLoadingUsers(true);
      fetch(`/api/projects/${projectId}/members`)
        .then((r) => r.json())
        .then((data) =>
          setUsers(
            (data.availableUsers ?? []).map(
              (u: UserListPerson) => ({
                id: u.id,
                name: u.name,
                avatarUrl: u.avatarUrl ?? null,
                departmentName: u.departmentName ?? null,
                subDepartmentName: u.subDepartmentName ?? null,
              }),
            ),
          ),
        )
        .catch(() => {})
        .finally(() => setLoadingUsers(false));
    }
  }

  function toggleUser(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function addMembers() {
    if (selectedIds.size === 0) return;
    setSaving(true);
    const newIds = [...currentMemberIds, ...selectedIds];
    await updateAdminProject(projectId, { memberIds: newIds } as never);
    for (const id of selectedIds) {
      const added = users.find((u) => u.id === id);
      if (added) onMemberAdded(added.id, added.name);
    }
    setSaving(false);
    setAdding(false);
    setSelectedIds(new Set());
    startTransition(() => router.refresh());
  }

  const filtered = users.filter((u) => matchesUserListSearch(u, query));

  return (
    <div className="pen-glass-panel rounded-xl border border-pen-card-border p-4">
      <div className="mb-3 flex items-center gap-2">
        <p className="pen-text-section-label flex-1">
          Project Members
        </p>
        <button
          type="button"
          onClick={openAdding}
          className="flex items-center gap-1 rounded-md border border-pen-card-border px-2 py-1 font-sans text-[11.5px] text-pen-muted transition-colors hover:border-pen-id hover:text-pen-id"
        >
          <UserPlus className="size-3" />
          Add
        </button>
      </div>

      {projectMembers.length === 0 ? (
        <p className="font-sans text-[12px] text-pen-subtle">
          No members assigned yet
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {projectMembers.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <UserAvatar name={m.name} avatarUrl={m.avatarUrl} size={28} />
              <div className="min-w-0 flex-1">
                <p className="font-sans text-[12px] font-semibold text-pen-foreground">
                  {m.name}
                </p>
                {(m.departmentName || m.subDepartmentName) && (
                  <p className="font-sans text-[11.5px] text-pen-subtle">
                    {[m.departmentName, m.subDepartmentName].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center pen-overlay-backdrop"
          onClick={() => setAdding(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-pen-card-border bg-pen-bg p-4 shadow-xl backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="font-sans text-[13px] font-semibold text-pen-foreground">
                Add members
                {selectedIds.size > 0 && (
                  <span className="ml-1.5 font-normal text-pen-subtle">
                    ({selectedIds.size} selected)
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="text-pen-muted hover:text-pen-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-pen-subtle" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search members…"
                className="h-8 w-full rounded-md border border-pen-card-border bg-pen-surface pl-8 pr-3 font-sans text-[12.5px] text-pen-foreground outline-none focus:border-pen-id"
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {loadingUsers ? (
                <p className="py-4 text-center font-sans text-[12px] text-pen-subtle">
                  Loading…
                </p>
              ) : filtered.length === 0 ? (
                <p className="py-4 text-center font-sans text-[12px] text-pen-subtle">
                  No users available
                </p>
              ) : (
                filtered.map((u) => {
                  const selected = selectedIds.has(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleUser(u.id)}
                      className={cn(
                        userListPickerButtonClass,
                        "gap-2.5 rounded-md px-2 py-1.5 transition-colors",
                        selected ? "bg-pen-blue-tint" : "hover:bg-pen-surface",
                      )}
                    >
                      <UserListItem
                        person={u}
                        avatarSize={24}
                        className="min-w-0 flex-1"
                        nameClassName="font-normal"
                      />
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                          selected
                            ? "border-pen-blue bg-pen-blue"
                            : "border-pen-card-border bg-pen-surface",
                        )}
                      >
                        {selected && (
                          <span className="block h-px w-2 rotate-45 translate-y-px border-r-2 border-t-2 border-white" />
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="h-7 rounded-md border border-pen-card-border px-3 font-sans text-[12px] text-pen-muted hover:bg-pen-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={selectedIds.size === 0 || saving}
                onClick={addMembers}
                className="h-7 rounded-md bg-pen-blue px-3 font-sans text-[12px] font-medium text-white dark:text-gray-900 disabled:opacity-50"
              >
                {saving
                  ? "Adding…"
                  : `Add${selectedIds.size > 1 ? ` (${selectedIds.size})` : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SubDepartmentStatusBreakdown({
  subDepartmentBoardGroups,
}: {
  subDepartmentBoardGroups: SubDepartmentBoardGroup[];
}) {
  if (subDepartmentBoardGroups.length === 0) return null;

  return (
    <div className="rounded-xl border border-pen-card-border bg-pen-card px-4 py-3">
      <p className="mb-3 pen-text-section-label">
        Team breakdown
      </p>

      <div className="flex flex-col gap-3">
        {subDepartmentBoardGroups.map((g) => {
          const sortedStatuses = [...g.statuses].sort(
            (a, b) => a.order - b.order,
          );
          const completeLabels = new Set(
            g.statuses.filter((s) => s.isComplete).map((s) => s.label),
          );
          const total = g.cards.length;
          const done = g.cards.filter((c) => completeLabels.has(c.status)).length;
          const overdue = g.cards.filter((c) => c.due === "Overdue").length;
          const donePercent = total > 0 ? Math.round((done / total) * 100) : 0;
          const subDepartmentColor = avatarColorFor(g.subDepartmentName);

          return (
            <div
              key={g.subDepartmentId}
              className="rounded-xl border border-pen-card-border/60 bg-pen-surface/30 p-3 dark:bg-white/3"
            >
              {/* Header row */}
              <div className="mb-2.5 flex items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: subDepartmentColor }}
                />
                <p className="min-w-0 flex-1 truncate font-sans text-[12.5px] font-semibold text-pen-foreground">
                  {g.subDepartmentName}
                </p>
                <span className="shrink-0 font-sans text-[11.5px] tabular-nums text-pen-muted">
                  {done}/{total} done
                </span>
                <span
                  className="min-w-[32px] shrink-0 text-right font-sans text-[11.5px] font-bold tabular-nums"
                  style={{
                    color:
                      donePercent >= 75
                        ? "#059669"
                        : donePercent >= 40
                          ? "#f97316"
                          : subDepartmentColor,
                  }}
                >
                  {donePercent}%
                </span>
              </div>

              {/* Segmented progress bar */}
              <div className="mb-2.5 flex h-2 w-full overflow-hidden rounded-full bg-pen-card-border/50">
                {sortedStatuses.map((s) => {
                  const count = g.cards.filter(
                    (c) => c.status === s.label,
                  ).length;
                  const pct = total > 0 ? (count / total) * 100 : 0;
                  return pct > 0 ? (
                    <div
                      key={s.id}
                      className="transition-all"
                      style={{ width: `${pct}%`, backgroundColor: s.color }}
                    />
                  ) : null;
                })}
              </div>

              {/* Status chips */}
              <div className="flex flex-wrap gap-1.5">
                {sortedStatuses.map((s) => {
                  const count = g.cards.filter(
                    (c) => c.status === s.label,
                  ).length;
                  if (count === 0) return null;
                  return (
                    <span
                      key={s.id}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-sans text-[11.5px] font-medium"
                      style={{
                        backgroundColor: `${s.color}18`,
                        color: s.color,
                      }}
                    >
                      <span
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      {count} {s.label}
                    </span>
                  );
                })}
                {overdue > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-0.5 font-sans text-[11.5px] font-medium text-red-500">
                    <span className="size-1.5 rounded-full bg-red-500" />
                    {overdue} Overdue
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProjectPersonCell({
  name,
  avatarUrl,
  size = 22,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
      <UserAvatar name={name} avatarUrl={avatarUrl} size={size} />
      <span
        className="min-w-0 truncate font-sans text-[12px] text-pen-foreground"
        title={name}
      >
        {name}
      </span>
    </span>
  );
}

function TicketList({
  tickets,
  statuses,
  projectId,
  projectSlug,
  projectName,
  mainSubDepartmentId,
  boardSubDepartments = [],
  subDepartmentMembersForCreate,
  detailsQueryKey,
  supportProject = false,
  canModifyProject = false,
}: {
  tickets: TicketRow[];
  statuses: SubDepartmentStatusConfig[];
  projectId: string;
  projectSlug: string;
  projectName: string;
  mainSubDepartmentId: string | null;
  boardSubDepartments?: { id: string; name: string }[];
  subDepartmentMembersForCreate: UserListPerson[];
  detailsQueryKey?: string;
  supportProject?: boolean;
  canModifyProject?: boolean;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);

  function refresh() {
    if (detailsQueryKey) {
      void queryClient.invalidateQueries({
        queryKey: projectDetailsKeys.detail(detailsQueryKey),
      });
    }
    startTransition(() => router.refresh());
  }
  function makeHref(ticketId: string) {
    const p = new URLSearchParams({
      from: "project",
      projectId,
      projectSlug,
      projectName,
      tab: "tickets",
    });
    return `/tickets/${ticketId}?${p.toString()}`;
  }
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");

  const statusLabels = [...new Set(tickets.map((t) => t.status))];
  const statusColorMap = Object.fromEntries(
    statuses.map((s) => [s.label, s.color]),
  );
  const completeStatuses = new Set(
    statuses.filter((s) => s.isComplete).map((s) => s.label),
  );
  const filtered = tickets.filter((t) => {
    if (
      search &&
      !t.title.toLowerCase().includes(search.toLowerCase()) &&
      !t.humanId.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    return true;
  });

  const defaultBoardSubDepartmentId =
    boardSubDepartments.find((t) => t.id === mainSubDepartmentId)?.id ??
    boardSubDepartments[0]?.id ??
    mainSubDepartmentId;
  const canCreate = canModifyProject && !supportProject && (boardSubDepartments.length > 0 || !!mainSubDepartmentId);
  const singleBoardName =
    boardSubDepartments.length === 1 ? boardSubDepartments[0].name : null;

  return (
    <div className="flex flex-col gap-3">
      {showCreate && canCreate && (
        <NewTicketModal
          projects={[{ id: projectId, name: projectName }]}
          subDepartmentMembers={[]}
          defaultProjectId={projectId}
          defaultProjectName={projectName}
          defaultBoardSubDepartmentId={defaultBoardSubDepartmentId ?? undefined}
          defaultSubDepartmentId={defaultBoardSubDepartmentId ?? mainSubDepartmentId ?? undefined}
          boardSubDepartments={boardSubDepartments.length > 0 ? boardSubDepartments : undefined}
          subDepartmentMembersForCreate={subDepartmentMembersForCreate}
          onCreated={() => {
            setShowCreate(false);
            refresh();
          }}
          onClose={() => setShowCreate(false)}
        />
      )}
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tickets…"
          className="h-8 w-48 shrink-0 rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[12.5px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id"
        />
        <SearchableSelect
          value={filterStatus}
          onChange={setFilterStatus}
          options={[
            { value: "all", label: "All statuses" },
            ...statusLabels.map((s) => ({ value: s, label: s })),
          ]}
          size="sm"
          highlightWhenSet={filterStatus !== "all"}
          aria-label="Filter by status"
          className="w-auto min-w-[9.5rem] max-w-[14rem] shrink-0"
        />
        <SearchableSelect
          value={filterPriority}
          onChange={setFilterPriority}
          options={[
            { value: "all", label: "All priorities" },
            ...PRIORITY_ORDER.map((p) => ({ value: p, label: p })),
          ]}
          size="sm"
          highlightWhenSet={filterPriority !== "all"}
          aria-label="Filter by priority"
          className="w-auto min-w-[9.5rem] max-w-[12rem] shrink-0"
        />
        <span className="ml-auto font-sans text-[11.5px] text-pen-subtle">
          {filtered.length} ticket{filtered.length !== 1 ? "s" : ""}
        </span>
        {canCreate && (
          <div className="flex items-center gap-2">
            {singleBoardName && (
              <span className="hidden font-sans text-[11px] text-pen-subtle sm:inline">
                Board: {singleBoardName}
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-pen-id px-3 font-sans text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
            >
              <Plus className="size-3.5" />
              Create task
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-pen-card-border bg-pen-card">
        {filtered.length === 0 ? (
          <div className="flex h-24 items-center justify-center">
            <p className="font-sans text-[12.5px] text-pen-subtle">
              No tickets match your filters
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#f0f4f8] dark:divide-[#3a3a37]">
            {filtered.map((t) => {
              const due = dueLabel(t.dueDate, {
                isStatusComplete: completeStatuses.has(t.status),
                isBlocked: isBlockedStatus(t.status),
              });
              return (
                <Link
                  key={t.id}
                  href={makeHref(t.id)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-pen-bg/40"
                >
                  {/* Priority dot */}
                  <PriorityDot
                    priority={uiPriorityFromDb(t.priority)}
                    status={t.status}
                  />

                  {/* ID + title */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="shrink-0 font-mono text-[11.5px] text-pen-subtle">
                        {t.humanId}
                      </span>
                      <span className="truncate font-sans text-[13px] font-semibold text-pen-foreground">
                        {t.title}
                      </span>
                    </div>
                    {(t.labels.length > 0 || (t.lastMessageDirection && !completeStatuses.has(t.status))) && (
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        {t.labels.slice(0, 3).map((l) => (
                          <TagPill key={l} label={l} size="sm" />
                        ))}
                        {t.lastMessageDirection && !completeStatuses.has(t.status) && (
                          <span
                            className={cn(
                              "inline-flex items-center whitespace-nowrap py-[2px] font-sans text-[9.5px] font-medium ring-1 ring-inset ring-black/4 dark:ring-white/10",
                              t.lastMessageDirection === "outbound"
                                ? "bg-[#fffbeb] text-[#b45309] dark:bg-[#3a3018] dark:text-[#fcd34d]"
                                : "bg-[#ecfeff] text-[#0e7490] dark:bg-[#143038] dark:text-[#67e8f9]",
                            )}
                            style={{
                              clipPath: "polygon(0 0, calc(100% - 5px) 0%, 100% 50%, calc(100% - 5px) 100%, 0 100%, 3px 50%)",
                              paddingLeft: "7px",
                              paddingRight: "9px",
                            }}
                          >
                            {t.lastMessageDirection === "outbound" ? "Waiting for customer" : "Waiting for assignee"}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Status */}
                  <div className="hidden sm:block">
                    <StatusPill
                      status={t.status}
                      color={statusColorMap[t.status]}
                      size="sm"
                    />
                  </div>

                  {/* Assignee */}
                  <div className="hidden min-w-0 max-w-[140px] shrink-0 items-center gap-1.5 sm:flex">
                    {t.assigneeName ? (
                      <ProjectPersonCell
                        name={t.assigneeName}
                        avatarUrl={t.assigneeAvatarUrl}
                        size={22}
                      />
                    ) : (
                      <span className="font-sans text-[11.5px] text-pen-subtle">Unassigned</span>
                    )}
                  </div>

                  {/* Creator */}
                  <div className="hidden min-w-0 max-w-[140px] shrink-0 xl:flex">
                    {t.creatorName?.trim() ? (
                      <ProjectPersonCell name={t.creatorName} size={22} />
                    ) : (
                      <span className="font-sans text-[11.5px] text-pen-subtle">—</span>
                    )}
                  </div>

                  {/* Created */}
                  <span
                    className="hidden shrink-0 font-sans text-[11.5px] text-pen-muted md:block"
                    title={formatDateTime(new Date(t.createdAt))}
                  >
                    {formatDateTime(new Date(t.createdAt))}
                  </span>

                  {/* Comments */}
                  {t.commentCount > 0 && (
                    <span className="hidden items-center gap-1 font-sans text-[11.5px] text-pen-subtle sm:flex">
                      <MessageCircle className="size-3" />
                      {t.commentCount}
                    </span>
                  )}

                  {/* Due date */}
                  {due && (
                    <span
                      className={cn(
                        "hidden shrink-0 font-sans text-[11.5px] sm:block",
                        due.label === "Complete"
                          ? "font-medium text-pen-green"
                          : due.overdue
                            ? "font-medium text-red-500"
                            : due.urgent
                              ? "font-medium text-amber-500"
                              : "text-pen-subtle",
                      )}
                    >
                      {due.label}
                    </span>
                  )}

                  {/* Updated */}
                  <span className="hidden shrink-0 font-sans text-[11.5px] text-pen-muted lg:block">
                    {timeAgo(t.updatedAt)}
                  </span>

                  <ArrowUpRight className="size-3.5 shrink-0 text-pen-subtle" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

const ACTIVITY_LABEL: Record<string, (m: Record<string, unknown>) => string> = {
  STATUS_CHANGED: (m) => `moved to ${m.to ?? "?"}`,
  ASSIGNED: (m) => (m.toName ? `assigned to ${m.toName}` : "unassigned"),
  COMMENT_ADDED: () => "commented",
  ATTACHMENT_ADDED: (m) => `attached ${m.fileName ?? "a file"}`,
  MENTION: () => "mentioned someone",
};

const ACTIVITY_ICON_COLOR: Record<string, string> = {
  STATUS_CHANGED: "#0a76b9",
  ASSIGNED: "#7c3aed",
  COMMENT_ADDED: "#059669",
  ATTACHMENT_ADDED: "#f97316",
  MENTION: "#0a76b9",
};

function OverviewTab({
  stats,
  statusDist,
  recentTickets,
  statuses,
  projectId,
  projectSlug,
  projectName,
  detailsQueryKey,
  subDepartmentBoardGroups,
  recentActivity,
  timeStats,
  initialStatus,
  initialDescription,
  initialLifecycleStages,
  initialAssets,
  canEdit,
  canManageLifecycle = false,
  onOpenAssets,
  supportProject = false,
}: {
  stats: Stats;
  statusDist: StatusDist[];
  recentTickets: TicketRow[];
  statuses: SubDepartmentStatusConfig[];
  projectId: string;
  projectSlug: string;
  projectName: string;
  detailsQueryKey?: string;
  subDepartmentBoardGroups: SubDepartmentBoardGroup[];
  recentActivity: ActivityItem[];
  timeStats?: ProjectTimeStats;
  initialStatus: "pipeline" | "in_development" | "live";
  initialDescription: string | null;
  initialLifecycleStages: import("@/lib/project-lifecycle").LifecycleStage[];
  initialAssets: import("./project-asset-manager").AssetNode[];
  canEdit: boolean;
  canManageLifecycle?: boolean;
  onOpenAssets: () => void;
  supportProject?: boolean;
}) {
  const [activityFilter, setActivityFilter] = useState<string>("all");
  const [activityLimit, setActivityLimit] = useState(10);

  function makeHref(ticketId: string) {
    const p = new URLSearchParams({
      from: "project",
      projectId,
      projectSlug,
      projectName,
      tab: "overview",
    });
    return `/tickets/${ticketId}?${p.toString()}`;
  }
  const statusColorMap = Object.fromEntries(
    statuses.map((s) => [s.label, s.color]),
  );

  const ACTIVITY_FILTERS = [
    { id: "all", label: "All" },
    { id: "STATUS_CHANGED", label: "Status" },
    { id: "ASSIGNED", label: "Assigned" },
    { id: "COMMENT_ADDED", label: "Comments" },
    { id: "ATTACHMENT_ADDED", label: "Attachments" },
    { id: "MENTION", label: "Mentions" },
  ];

  const filteredActivity =
    activityFilter === "all"
      ? recentActivity
      : recentActivity.filter((a) => a.action === activityFilter);
  const visibleActivity = filteredActivity.slice(0, activityLimit);

  // Summary stats derived from all tickets (including sub-tickets)
  const totalTickets = recentTickets.length;
  const completeStatusLabels = new Set(
    statuses.filter((s) => s.isComplete).map((s) => s.label),
  );
  const doneTickets = recentTickets.filter((t) =>
    completeStatusLabels.has(t.status),
  ).length;
  const overdueTotal = subDepartmentBoardGroups.reduce(
    (n, g) => n + g.cards.filter((c) => c.due === "Overdue").length,
    0,
  );
  const completionPct =
    totalTickets > 0 ? Math.round((doneTickets / totalTickets) * 100) : 0;

  // Asset counts
  const totalAssets = initialAssets.filter((a) => a.type !== "folder").length;
  const totalFolders = initialAssets.filter((a) => a.type === "folder").length;

  const SUMMARY_STATS = [
    { label: "Total tickets", value: totalTickets, color: "#0a76b9" },
    { label: "Completed", value: doneTickets, color: "#059669" },
    {
      label: "Completion",
      value: `${completionPct}%`,
      color:
        completionPct >= 75
          ? "#059669"
          : completionPct >= 40
            ? "#f97316"
            : "#6b7280",
    },
    {
      label: "Overdue",
      value: overdueTotal,
      color: overdueTotal > 0 ? "#dc2626" : "#6b7280",
    },
    { label: "Assets", value: totalAssets, color: "#7c3aed" },
    { label: "Folders", value: totalFolders, color: "#f97316" },
  ] as const;

  // Contributors map
  const contributorsMap = recentTickets.reduce((acc, t) => {
    if (!t.assigneeName) return acc;
    if (!acc.has(t.assigneeName)) {
      acc.set(t.assigneeName, {
        name: t.assigneeName,
        color: t.assigneeColor ?? avatarColorFor(t.assigneeName),
        avatarUrl: t.assigneeAvatarUrl ?? null,
        count: 0,
      });
    }
    acc.get(t.assigneeName)!.count++;
    return acc;
  }, new Map<string, { name: string; color: string; avatarUrl: string | null; count: number }>());
  const contributors = Array.from(contributorsMap.values()).sort(
    (a, b) => b.count - a.count,
  );
  const timeByUser = timeStats?.byUser
    ? [...timeStats.byUser].sort((a, b) => b.totalSecs - a.totalSecs)
    : [];

  const maxContributorCount = contributors[0]?.count ?? 1;
  const maxTimeSecs = timeByUser[0]?.totalSecs ?? 1;

  const ACTIVITY_ICON_MAP: Record<string, React.ElementType> = {
    STATUS_CHANGED: ArrowRightLeft,
    ASSIGNED: UserCheck,
    COMMENT_ADDED: MessageCircle,
    ATTACHMENT_ADDED: Paperclip,
    MENTION: AtSign,
  };

  type AT = import("./project-asset-manager").AssetNodeType;
  const ASSET_TYPES: { type: AT; label: string; icon: React.ElementType; color: string }[] = [
    { type: "folder",   label: "Folders",  icon: FolderIcon,   color: "#f97316" },
    { type: "image",    label: "Images",   icon: ImageIcon,    color: "#0a76b9" },
    { type: "pdf",      label: "PDFs",     icon: FileTextIcon, color: "#dc2626" },
    { type: "document", label: "Docs",     icon: FileTextIcon, color: "#7c3aed" },
    { type: "video",    label: "Videos",   icon: FilmIcon,     color: "#059669" },
    { type: "markdown", label: "Markdown", icon: CodeIcon,     color: "#0891b2" },
    { type: "link",     label: "Links",    icon: Link2Icon,    color: "#94a3b8" },
  ];
  const assetCounts = ASSET_TYPES.map((t) => ({
    ...t,
    count: initialAssets.filter((a) => a.type === t.type).length,
  })).filter((t) => t.count > 0);
  const totalAssetCount = initialAssets.length;

  return (
    <div className="flex flex-col gap-4">

      {/* ── Stats row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Total tickets */}
        <div className="flex flex-col gap-2 rounded-xl border border-pen-card-border bg-pen-card px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="font-sans text-[11px] font-semibold uppercase tracking-wide text-pen-subtle">Total</span>
            <TicketCheck className="size-3.5 text-pen-blue/60" strokeWidth={2} />
          </div>
          <span className="font-sans text-[26px] font-bold leading-none tabular-nums text-pen-foreground">{totalTickets}</span>
          <span className="font-sans text-[11px] text-pen-subtle">tickets</span>
        </div>

        {/* Completed */}
        <div className="flex flex-col gap-2 rounded-xl border border-pen-card-border bg-pen-card px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="font-sans text-[11px] font-semibold uppercase tracking-wide text-pen-subtle">Done</span>
            <CheckCircle2 className="size-3.5 text-emerald-500/70" strokeWidth={2} />
          </div>
          <span className="font-sans text-[26px] font-bold leading-none tabular-nums text-emerald-500">{doneTickets}</span>
          <span className="font-sans text-[11px] text-pen-subtle">completed</span>
        </div>

        {/* Completion % */}
        <div className="flex flex-col gap-2 rounded-xl border border-pen-card-border bg-pen-card px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="font-sans text-[11px] font-semibold uppercase tracking-wide text-pen-subtle">Rate</span>
            <TrendingUp
              className="size-3.5"
              style={{ color: completionPct >= 75 ? "#059669" : completionPct >= 40 ? "#f97316" : "#94a3b8", opacity: 0.7 }}
              strokeWidth={2}
            />
          </div>
          <span
            className="font-sans text-[26px] font-bold leading-none tabular-nums"
            style={{ color: completionPct >= 75 ? "#059669" : completionPct >= 40 ? "#f97316" : "#94a3b8" }}
          >
            {completionPct}%
          </span>
          <div className="h-1 overflow-hidden rounded-full bg-pen-surface">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${completionPct}%`,
                backgroundColor: completionPct >= 75 ? "#059669" : completionPct >= 40 ? "#f97316" : "#94a3b8",
              }}
            />
          </div>
        </div>

        {/* Overdue */}
        <div className="flex flex-col gap-2 rounded-xl border border-pen-card-border bg-pen-card px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="font-sans text-[11px] font-semibold uppercase tracking-wide text-pen-subtle">Overdue</span>
            <AlertTriangle
              className="size-3.5"
              style={{ color: overdueTotal > 0 ? "#dc2626" : "#94a3b8", opacity: 0.7 }}
              strokeWidth={2}
            />
          </div>
          <span
            className="font-sans text-[26px] font-bold leading-none tabular-nums"
            style={{ color: overdueTotal > 0 ? "#dc2626" : "#94a3b8" }}
          >
            {overdueTotal}
          </span>
          <span className="font-sans text-[11px] text-pen-subtle">{overdueTotal === 1 ? "ticket" : "tickets"}</span>
        </div>

        {/* Assets */}
        <div className="flex flex-col gap-2 rounded-xl border border-pen-card-border bg-pen-card px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="font-sans text-[11px] font-semibold uppercase tracking-wide text-pen-subtle">Assets</span>
            <Layers className="size-3.5 text-violet-500/60" strokeWidth={2} />
          </div>
          <span className="font-sans text-[26px] font-bold leading-none tabular-nums text-pen-foreground">{totalAssets}</span>
          <span className="font-sans text-[11px] text-pen-subtle">files</span>
        </div>

        {/* Folders */}
        <div className="flex flex-col gap-2 rounded-xl border border-pen-card-border bg-pen-card px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="font-sans text-[11px] font-semibold uppercase tracking-wide text-pen-subtle">Folders</span>
            <FolderIcon className="size-3.5 text-orange-400/70" strokeWidth={2} />
          </div>
          <span className="font-sans text-[26px] font-bold leading-none tabular-nums text-pen-foreground">{totalFolders}</span>
          <span className="font-sans text-[11px] text-pen-subtle">folders</span>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 min-[800px]:grid-cols-[1fr_300px] min-[1100px]:grid-cols-[1fr_340px]">

        {/* ── Left column ─────────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-4">
          <ProjectProfileTab
            projectId={projectId}
            detailsQueryKey={detailsQueryKey}
            initialStatus={initialStatus}
            initialDescription={initialDescription}
            initialLifecycleStages={initialLifecycleStages}
            canEdit={canEdit}
            canManageLifecycle={canManageLifecycle}
            supportProject={supportProject}
          />

          <SubDepartmentStatusBreakdown subDepartmentBoardGroups={subDepartmentBoardGroups} />

          {/* Assets */}
          <button
            type="button"
            onClick={onOpenAssets}
            title="Open assets"
            className="w-full rounded-xl border border-pen-card-border bg-pen-card px-4 py-3 text-left transition-colors hover:border-pen-blue/40 hover:bg-pen-surface/40"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="pen-text-section-label">Assets</p>
              {totalAssetCount > 0 && (
                <span className="rounded-full bg-pen-surface px-2 py-0.5 font-sans text-[11.5px] font-semibold text-pen-foreground">
                  {totalAssetCount} total
                </span>
              )}
            </div>
            {assetCounts.length === 0 ? (
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-pen-card-border px-3 py-4">
                <FolderOpen className="size-4 shrink-0 text-pen-subtle/30" />
                <p className="font-sans text-[11.5px] text-pen-subtle">No assets uploaded yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {assetCounts.map(({ type, label, icon: Icon, color, count }) => (
                  <div
                    key={type}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors"
                    style={{ backgroundColor: `${color}12` }}
                  >
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}20` }}>
                      <Icon className="size-3.5" style={{ color }} strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-sans text-[11px] text-pen-muted">{label}</p>
                      <p className="font-sans text-[14px] font-bold tabular-nums" style={{ color }}>{count}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </button>
        </div>

        {/* ── Right column ─────────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-4">

          {/* Ticket contributions */}
          <div className="rounded-xl border border-pen-card-border bg-pen-card px-4 py-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-lg bg-violet-500/10">
                  <Users className="size-3.5 text-violet-500" strokeWidth={2} />
                </div>
                <p className="pen-text-section-label">Contributors</p>
              </div>
              {contributors.length > 0 && (
                <span className="rounded-full bg-pen-surface px-2 py-0.5 font-sans text-[11.5px] text-pen-subtle">
                  {contributors.length} {contributors.length === 1 ? "member" : "members"}
                </span>
              )}
            </div>
            {contributors.length === 0 ? (
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-pen-card-border px-3 py-4">
                <Users className="size-4 shrink-0 text-pen-subtle/30" />
                <p className="font-sans text-[11.5px] text-pen-subtle">No assignees yet</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {contributors.map((c) => {
                  const pct = Math.round((c.count / maxContributorCount) * 100);
                  return (
                    <div key={c.name} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <UserAvatar name={c.name} avatarUrl={c.avatarUrl} size={20} />
                        <span className="min-w-0 flex-1 truncate font-sans text-[12px] font-medium text-pen-foreground">{c.name}</span>
                        <span className="shrink-0 font-sans text-[11.5px] tabular-nums text-pen-muted">{c.count}</span>
                      </div>
                      <div className="ml-[28px] h-1 overflow-hidden rounded-full bg-pen-surface">
                        <div className="h-full rounded-full bg-violet-500/60 transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Time logged — development */}
          <div className="rounded-xl border border-pen-card-border bg-pen-card px-4 py-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-lg bg-pen-blue/10">
                  <Timer className="size-3.5 text-pen-blue" strokeWidth={2} />
                </div>
                <p className="pen-text-section-label">Dev time logged</p>
              </div>
              {timeStats && timeStats.totalSecs > 0 && (
                <span className="rounded-full bg-pen-surface px-2 py-0.5 font-mono text-[11.5px] font-semibold text-pen-foreground">
                  {formatSecs(timeStats.totalSecs)}
                </span>
              )}
            </div>
            {timeByUser.length === 0 ? (
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-pen-card-border px-3 py-4">
                <Clock className="size-4 shrink-0 text-pen-subtle/30" />
                <p className="font-sans text-[11.5px] text-pen-subtle">No development time logged yet</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {timeByUser.map((u) => {
                  const pct = Math.round((u.totalSecs / maxTimeSecs) * 100);
                  return (
                    <div key={u.userId} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <UserAvatar name={u.userName} avatarUrl={u.avatarUrl} size={20} />
                        <span className="min-w-0 flex-1 truncate font-sans text-[12px] font-medium text-pen-foreground">{u.userName}</span>
                        <span className="shrink-0 font-mono text-[11.5px] font-semibold tabular-nums text-pen-foreground">{formatSecs(u.totalSecs)}</span>
                      </div>
                      <div className="ml-[28px] h-1 overflow-hidden rounded-full bg-pen-surface">
                        <div className="h-full rounded-full bg-pen-blue/50 transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent activity */}
          <div className="flex flex-col overflow-hidden rounded-xl border border-pen-card-border bg-pen-card">
            <div className="shrink-0 border-b border-pen-card-border px-4 pt-3 pb-2.5">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <div className="mr-auto flex items-center gap-2">
                  <div className="flex size-6 items-center justify-center rounded-lg bg-pen-surface">
                    <Activity className="size-3.5 text-pen-subtle" strokeWidth={2} />
                  </div>
                  <p className="pen-text-section-label">
                    Activity
                    {recentActivity.length > 0 && (
                      <span className="ml-1 font-normal normal-case tracking-normal text-pen-subtle/50">
                        ({filteredActivity.length})
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {ACTIVITY_FILTERS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => { setActivityFilter(f.id); setActivityLimit(10); }}
                      className={cn(
                        "h-6 rounded-md px-2 font-sans text-[11px] transition-colors",
                        activityFilter === f.id
                          ? "bg-pen-blue text-white dark:text-gray-900"
                          : "bg-pen-surface text-pen-muted hover:text-pen-foreground",
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {filteredActivity.length === 0 ? (
              <div className="mx-4 my-3 flex items-center gap-3 rounded-lg border border-dashed border-pen-card-border px-3 py-4">
                <Activity className="size-4 shrink-0 text-pen-subtle/30" />
                <p className="font-sans text-[11.5px] text-pen-subtle">No activity yet</p>
              </div>
            ) : (
              <div className="max-h-[380px] flex-1 divide-y divide-pen-card-border/50 overflow-y-auto">
                {visibleActivity.map((a) => {
                  const label = ACTIVITY_LABEL[a.action]?.(a.metadata) ?? a.action;
                  const accentColor = ACTIVITY_ICON_COLOR[a.action] ?? "#94a3b8";
                  const ActionIcon = ACTIVITY_ICON_MAP[a.action] ?? CircleDot;
                  return (
                    <Link
                      key={a.id}
                      href={makeHref(a.ticketId)}
                      className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-pen-bg/40"
                    >
                      <div className="relative mt-0.5 shrink-0">
                        <UserAvatar name={a.actorName} avatarUrl={a.actorAvatarUrl} size={24} />
                        <div
                          className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full border border-pen-card"
                          style={{ backgroundColor: `${accentColor}20` }}
                        >
                          <ActionIcon className="size-2.5" style={{ color: accentColor }} strokeWidth={2.5} />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-sans text-[12px] leading-snug text-pen-foreground">
                          <span className="font-semibold">{a.actorName}</span>{" "}
                          <span style={{ color: accentColor }}>{label}</span>
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-pen-muted">{a.ticketHumanId}</p>
                      </div>
                      <span className="mt-0.5 shrink-0 font-sans text-[11px] text-pen-subtle">{timeAgo(a.createdAt)}</span>
                    </Link>
                  );
                })}
                {filteredActivity.length > activityLimit && (
                  <button
                    type="button"
                    onClick={() => setActivityLimit((n) => n + 10)}
                    className="w-full px-4 py-2.5 text-center font-sans text-[11.5px] text-pen-muted transition-colors hover:bg-pen-bg/40 hover:text-pen-foreground"
                  >
                    Show {filteredActivity.length - activityLimit} more
                  </button>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Team boards ───────────────────────────────────────────────────────────────

type SubDepartmentBoardGroup = SubDepartmentBoardGroupData;

function BoardTabContextMenu({
  menu,
  onClose,
  onRemove,
  removing,
}: {
  menu: { subDepartmentId: string; subDepartmentName: string; ticketCount: number; x: number; y: number };
  onClose: () => void;
  onRemove: () => void;
  removing: boolean;
}) {
  const canRemove = menu.ticketCount === 0;

  useEffect(() => {
    function handleClick() {
      onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("click", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("click", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed z-50 min-w-[180px] rounded-lg border border-pen-card-border bg-pen-card py-1 shadow-lg"
      style={{ left: menu.x, top: menu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={!canRemove || removing}
        onClick={onRemove}
        title={
          canRemove
            ? "Remove this board from the project"
            : "Cannot remove while tickets remain on this board"
        }
        className={cn(
          "flex w-full items-center px-3 py-2 text-left font-sans text-[12.5px]",
          canRemove
            ? "text-red-600 hover:bg-pen-surface dark:text-red-400"
            : "cursor-not-allowed text-pen-muted",
        )}
      >
        {removing ? "Removing…" : "Remove board"}
      </button>
      {!canRemove && (
        <p className="px-3 pb-2 font-sans text-[11px] text-pen-subtle">
          {menu.ticketCount} ticket{menu.ticketCount !== 1 ? "s" : ""} remain
        </p>
      )}
    </div>
  );
}

function AddBoardButton({
  subDepartments,
  onAdd,
  adding,
  creatingSubDepartmentId,
}: {
  subDepartments: AddableBoardSubDepartment[];
  onAdd: (subDepartmentId: string) => void | Promise<void>;
  adding: boolean;
  creatingSubDepartmentId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function toggleOpen() {
    const btn = buttonRef.current;
    if (!btn) return;
    if (open) {
      setOpen(false);
      return;
    }
    const rect = btn.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, left: rect.left });
    setOpen(true);
  }

  if (subDepartments.length === 0) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        disabled={adding}
        title="Add board — department teams or teams of assigned members"
        className="mb-2 flex size-7 shrink-0 items-center justify-center rounded-md border border-dashed border-pen-card-border text-pen-subtle transition-colors hover:border-pen-id hover:text-pen-id disabled:opacity-50"
      >
        {adding ? (
          <Loader2 className="size-3.5 animate-spin text-pen-id" />
        ) : (
          <Plus className="size-3.5" />
        )}
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            className="pen-field-dropdown fixed z-[100] max-h-72 min-w-[220px] max-w-[min(280px,calc(100vw-1rem))] overflow-y-auto rounded-lg py-1"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            <p className="px-3 py-1.5 font-sans text-[10.5px] font-medium uppercase tracking-wide text-pen-subtle">
              Add board
            </p>
            {subDepartments.map((t) => {
              const badge = boardSubDepartmentSourceBadge(t.source);
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={adding}
                  onClick={() => {
                    setOpen(false);
                    void onAdd(t.id);
                  }}
                  className="pen-field-dropdown-item flex w-full flex-col gap-0.5 px-3 py-2 text-left disabled:opacity-50"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-sans text-[12.5px] font-medium text-pen-foreground">
                      {t.name}
                    </span>
                    {creatingSubDepartmentId === t.id ? (
                      <Loader2 className="size-3 shrink-0 animate-spin text-pen-id" />
                    ) : (
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-px font-sans text-[10px] font-semibold",
                          badge.className,
                        )}
                      >
                        {badge.label}
                      </span>
                    )}
                  </span>
                  <span className="font-sans text-[11px] text-pen-subtle">
                    {boardSubDepartmentSourceLabel(t.source, t.memberNames)}
                  </span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}

// ── Header member avatars + add ───────────────────────────────────────────────

function HeaderMemberAvatars({
  projectMembers,
  projectId,
  detailsQueryKey,
  currentUserIsProjectMember = false,
  canSelfJoinProject = true,
}: {
  projectMembers: UserListPerson[];
  projectId: string;
  detailsQueryKey?: string;
  currentUserIsProjectMember?: boolean;
  canSelfJoinProject?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [, startTransition] = useTransition();
  const currentUser = useAuthStore((s) => s.user);
  const isPrivileged =
    currentUser?.role === "admin" ||
    currentUser?.role === "manager" ||
    currentUser?.role === "sub_manager";

  const serverMembers = projectMembers.map((m) => ({
    id: m.id,
    name: m.name,
    avatarUrl: m.avatarUrl ?? null,
    subDepartmentName: m.subDepartmentName ?? "",
  }));

  // Optimistic local list — syncs when server data refreshes
  const [localMembers, setLocalMembers] = useState(serverMembers);
  useEffect(() => {
    setLocalMembers(serverMembers);
  }, [projectMembers]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentIds = localMembers.map((m) => m.id);
  const [joinedLocally, setJoinedLocally] = useState(false);

  useEffect(() => {
    setJoinedLocally(false);
  }, [currentUserIsProjectMember, projectId]);

  const showJoin =
    !!currentUser &&
    canSelfJoinProject &&
    !currentUserIsProjectMember &&
    !joinedLocally;
  const isSelfMember =
    currentUserIsProjectMember ||
    joinedLocally ||
    (!!currentUser && currentIds.includes(currentUser.id));

  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserListPerson[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [joining, setJoining] = useState(false);

  function refresh() {
    if (detailsQueryKey) {
      void queryClient.invalidateQueries({
        queryKey: projectDetailsKeys.detail(detailsQueryKey),
      });
    }
    startTransition(() => router.refresh());
  }

  // Self-join: optimistically add avatar, then sync from server
  async function selfJoin() {
    if (!currentUser) return;
    setJoining(true);
    setJoinedLocally(true);
    // Optimistic update — avatar appears instantly
    setLocalMembers((prev) => [
      ...prev,
      {
        id: currentUser.id,
        name: currentUser.name,
        avatarUrl: currentUser.avatarUrl ?? null,
        subDepartmentName: "",
      },
    ]);
    try {
      const res = await fetch(`/api/projects/${projectId}/join`, { method: "POST" });
      if (!res.ok) throw new Error("Join failed");
      refresh();
    } catch {
      // Revert on failure
      setJoinedLocally(false);
      setLocalMembers(serverMembers);
    } finally {
      setJoining(false);
    }
  }

  function openAdding() {
    setAdding(true);
    setQuery("");
    setSelectedIds(new Set());
    if (users.length === 0) {
      setLoadingUsers(true);
      fetch(`/api/projects/${projectId}/members`)
        .then((r) => r.json())
        .then((data) =>
          setUsers(
            (data.availableUsers ?? []).map((u: UserListPerson) => ({
              id: u.id,
              name: u.name,
              avatarUrl: u.avatarUrl ?? null,
              departmentName: u.departmentName ?? null,
              subDepartmentName: u.subDepartmentName ?? null,
            })),
          ),
        )
        .catch(() => {})
        .finally(() => setLoadingUsers(false));
    }
  }

  function toggleUser(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function confirm() {
    if (selectedIds.size === 0) return;
    setSaving(true);
    const newIds = [...selectedIds];
    // Optimistic: add selected users to local list immediately
    const added = users
      .filter((u) => selectedIds.has(u.id))
      .map((u) => ({
        id: u.id,
        name: u.name,
        avatarUrl: u.avatarUrl ?? null,
        subDepartmentName: u.subDepartmentName ?? "",
      }));
    setLocalMembers((prev) => [...prev, ...added]);
    setAdding(false);
    setSelectedIds(new Set());
    setUsers([]);
    try {
      if (isPrivileged) {
        // Admin/manager/sub_manager: full member replace via admin route
        await updateAdminProject(projectId, {
          memberIds: [...currentIds, ...newIds],
        } as never);
      } else {
        const res = await fetch(`/api/projects/${projectId}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userIds: newIds }),
        });
        if (!res.ok) throw new Error("Add members failed");
      }
      refresh();
    } catch {
      setLocalMembers(serverMembers); // revert on failure
    } finally {
      setSaving(false);
    }
  }

  const filtered = users.filter((u) => matchesUserListSearch(u, query));

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <div className="flex h-7 max-w-[min(100vw-12rem,32rem)] items-center -space-x-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {localMembers.map((m) => (
          <UserAvatar
            key={m.id}
            name={m.name}
            avatarUrl={m.avatarUrl}
            size={28}
            className="relative shrink-0 ring-2 ring-pen-card"
            meta={{ subDepartment: m.subDepartmentName || undefined }}
          />
        ))}
      </div>

      {/* Self-join button for non-members (all roles) */}
      {showJoin && (
        <button
          type="button"
          onClick={selfJoin}
          disabled={joining}
          title="Join this project"
          className="flex h-7 items-center gap-1.5 rounded-full border border-dashed border-pen-card-border px-2.5 font-sans text-[11.5px] text-pen-subtle transition-colors hover:border-pen-id hover:text-pen-id disabled:opacity-50"
        >
          <UserPlus className="size-3" />
          {joining ? "Joining…" : "Join"}
        </button>
      )}

      {/* Any team member can add others; privileged roles can add without joining first */}
      {(isSelfMember || isPrivileged) && (
        <button
          type="button"
          onClick={openAdding}
          title="Add member"
          className="flex size-7 items-center justify-center rounded-full border border-dashed border-pen-card-border text-pen-subtle transition-colors hover:border-pen-id hover:text-pen-id"
        >
          <UserPlus className="size-3.5" />
        </button>
      )}

      {adding && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center pen-overlay-backdrop"
          onClick={() => setAdding(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-pen-card-border bg-pen-bg p-4 shadow-xl backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="font-sans text-[13px] font-semibold text-pen-foreground">
                Add project members
                {selectedIds.size > 0 && (
                  <span className="ml-1.5 font-normal text-pen-subtle">
                    ({selectedIds.size} selected)
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="text-pen-muted hover:text-pen-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-pen-subtle" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="h-8 w-full rounded-md border border-pen-card-border bg-pen-surface pl-8 pr-3 font-sans text-[12.5px] text-pen-foreground outline-none focus:border-pen-id"
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {loadingUsers ? (
                <p className="py-4 text-center font-sans text-[12px] text-pen-subtle">
                  Loading…
                </p>
              ) : filtered.length === 0 ? (
                <p className="py-4 text-center font-sans text-[12px] text-pen-subtle">
                  No users available
                </p>
              ) : (
                filtered.map((u) => {
                  const selected = selectedIds.has(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleUser(u.id)}
                      className={cn(
                        userListPickerButtonClass,
                        "gap-2.5 rounded-md px-2 py-1.5 transition-colors",
                        selected ? "bg-pen-blue-tint" : "hover:bg-pen-surface",
                      )}
                    >
                      <UserListItem
                        person={u}
                        avatarSize={24}
                        className="min-w-0 flex-1"
                        nameClassName="font-normal"
                      />
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                          selected
                            ? "border-pen-blue bg-pen-blue"
                            : "border-pen-card-border bg-pen-surface",
                        )}
                      >
                        {selected && (
                          <span className="block h-px w-2 rotate-45 translate-y-px border-r-2 border-t-2 border-white" />
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="h-7 rounded-md border border-pen-card-border px-3 font-sans text-[12px] text-pen-muted hover:bg-pen-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={selectedIds.size === 0 || saving}
                onClick={confirm}
                className="h-7 rounded-md bg-pen-blue px-3 font-sans text-[12px] font-medium text-white dark:text-gray-900 disabled:opacity-50"
              >
                {saving
                  ? "Adding…"
                  : `Add${selectedIds.size > 1 ? ` (${selectedIds.size})` : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page shell ─────────────────────────────────────────────────────────────────

type Tab = ProjectTab;

export function ProjectProfilePage({
  projectIdOrSlug,
  initialData,
  createDepartments = [],
  lockedDepartment = null,
}: {
  projectIdOrSlug: string;
  initialData?: ProjectDetailsResponse;
  createDepartments?: { id: string; name: string }[];
  lockedDepartment?: { id: string; name: string } | null;
}) {
  const { data, isPending, isError } = useProjectDetails(
    projectIdOrSlug,
    initialData,
  );

  useProjectBoardsRealtime(data?.project.id ?? "", projectIdOrSlug);
  useProjectRealtime(data?.project.id ?? "", projectIdOrSlug);

  useEffect(() => {
    if (data?.project.name) {
      document.title = `${data.project.name} — Support Ticketing System`;
    }
    return () => {
      document.title = "Support Ticketing System";
    };
  }, [data?.project.name]);

  if (isError || (!isPending && !data)) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="font-sans text-[13px] text-pen-subtle">
          Project not found.
        </span>
      </div>
    );
  }

  if (isPending && !data) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <ProjectDetailHeaderSkeleton />
        <ProjectDetailSectionsSkeleton />
      </div>
    );
  }

  if (!data) return null;

  const {
    project,
    stats,
    members,
    statusDist,
    tickets,
    boardStatuses,
    subDepartmentBoardGroups = [],
    recentActivity = [],
    canEdit = false,
    canManageLifecycle = false,
    canManageProjectSettings = false,
    canManageBoards = false,
    canModifyProject = false,
    canAddAssets = false,
    canDeleteAssets = false,
    defaultTab = null,
    timeStats,
    allProjectAssignees = [],
    projectMemberUsers = [],
    currentUserIsProjectMember = false,
    canSelfJoinProject = true,
    mainSubDepartmentId = null,
    addableBoardSubDepartments = [],
  } = data;

  return (
    <ProjectProfilePageInner
      project={project}
      stats={stats}
      members={members}
      statusDist={statusDist}
      tickets={tickets}
      boardStatuses={boardStatuses}
      subDepartmentBoardGroups={subDepartmentBoardGroups}
      recentActivity={recentActivity}
      canEdit={canEdit}
      canManageLifecycle={canManageLifecycle}
      canManageProjectSettings={canManageProjectSettings}
      canManageBoards={canManageBoards}
      canModifyProject={canModifyProject}
      canAddAssets={canAddAssets}
      canDeleteAssets={canDeleteAssets}
      defaultTab={defaultTab}
      timeStats={timeStats}
      allProjectAssignees={allProjectAssignees}
      projectMemberUsers={projectMemberUsers}
      currentUserIsProjectMember={currentUserIsProjectMember}
      canSelfJoinProject={canSelfJoinProject}
      mainSubDepartmentId={mainSubDepartmentId}
      addableBoardSubDepartments={addableBoardSubDepartments}
      detailsQueryKey={projectIdOrSlug}
      createDepartments={createDepartments}
      lockedDepartment={lockedDepartment}
    />
  );
}

function ProjectProfilePageInner({
  project,
  stats,
  members,
  statusDist,
  tickets,
  boardStatuses,
  subDepartmentBoardGroups = [],
  recentActivity = [],
  canEdit = false,
  canManageLifecycle = false,
  canManageProjectSettings = false,
  canManageBoards = false,
  canModifyProject = false,
  canAddAssets = false,
  canDeleteAssets = false,
  defaultTab = null,
  timeStats,
  allProjectAssignees = [],
  projectMemberUsers = [],
  currentUserIsProjectMember = false,
  canSelfJoinProject = true,
  mainSubDepartmentId = null,
  addableBoardSubDepartments = [],
  detailsQueryKey,
  createDepartments = [],
  lockedDepartment = null,
}: {
  project: Project;
  stats: Stats;
  members: Member[];
  statusDist: StatusDist[];
  tickets: TicketRow[];
  boardStatuses: SubDepartmentStatusConfig[];
  subDepartmentBoardGroups?: SubDepartmentBoardGroup[];
  recentActivity?: ActivityItem[];
  canEdit?: boolean;
  canManageLifecycle?: boolean;
  canManageProjectSettings?: boolean;
  canManageBoards?: boolean;
  canModifyProject?: boolean;
  canAddAssets?: boolean;
  canDeleteAssets?: boolean;
  defaultTab?: string | null;
  timeStats?: ProjectTimeStats;
  allProjectAssignees?: UserListPerson[];
  projectMemberUsers?: UserListPerson[];
  currentUserIsProjectMember?: boolean;
  canSelfJoinProject?: boolean;
  mainSubDepartmentId?: string | null;
  addableBoardSubDepartments?: AddableBoardSubDepartment[];
  detailsQueryKey?: string;
  createDepartments?: { id: string; name: string }[];
  lockedDepartment?: { id: string; name: string } | null;
}) {
  const isSupport = project.kind === "support";
  const queryClient = useQueryClient();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const currentUser = useAuthStore((s) => s.user);
  const isPrivileged =
    currentUser?.role === "admin" ||
    currentUser?.role === "manager" ||
    currentUser?.role === "sub_manager";
  const canExport =
    currentUser?.role === "admin" || currentUser?.role === "manager";

  const [boardView, setBoardView] = usePersistedView(
    VIEW_KEYS.projectSubDepartmentLayout,
    "board",
    ["board", "list"] as const,
  );
  const boardScrollerRef = useRef<HTMLDivElement | null>(null);
  const [boardMenu, setBoardMenu] = useState<{
    subDepartmentId: string;
    subDepartmentName: string;
    ticketCount: number;
    x: number;
    y: number;
  } | null>(null);
  const [boardAction, setBoardAction] = useState(false);
  const [creatingBoardSubDepartmentId, setCreatingBoardSubDepartmentId] = useState<string | null>(
    null,
  );
  const [filterPriority, setFilterPriority] = useState<Set<string>>(new Set());
  const [filterLabels, setFilterLabels] = useState<Set<string>>(new Set());
  const [filterAssignee, setFilterAssignee] = useState<Set<string>>(new Set());
  const [filterModule, setFilterModule] = useState<Set<string>>(new Set());

  function refreshProject() {
    if (!detailsQueryKey) return;
    void queryClient.refetchQueries({
      queryKey: projectDetailsKeys.detail(detailsQueryKey),
    });
    startTransition(() => router.refresh());
  }

  async function handleAddBoard(subDepartmentId: string) {
    if (!detailsQueryKey) return;
    const subDepartment = addableBoardSubDepartments.find((t) => t.id === subDepartmentId);
    if (!subDepartment) return;

    setCreatingBoardSubDepartmentId(subDepartmentId);
    setBoardAction(true);

    const queryKey = projectDetailsKeys.detail(detailsQueryKey);
    const previous = queryClient.getQueryData<ProjectDetailsResponse>(queryKey);

    try {
      const subDepartmentStatuses =
        subDepartment.statuses.length > 0
          ? subDepartment.statuses
          : await queryClient.ensureQueryData({
              queryKey: subDepartmentKeys.statuses(subDepartmentId),
              queryFn: () => getSubDepartmentStatuses(subDepartmentId),
            });

      queryClient.setQueryData<ProjectDetailsResponse>(queryKey, (old) => {
        if (!old || old.enabledBoardSubDepartmentIds.includes(subDepartmentId)) return old;
        return {
          ...old,
          enabledBoardSubDepartmentIds: [...old.enabledBoardSubDepartmentIds, subDepartmentId].sort(),
          addableBoardSubDepartments: old.addableBoardSubDepartments
            .filter((t) => t.id !== subDepartmentId)
            .sort((a, b) => a.name.localeCompare(b.name)),
          subDepartmentBoardGroups: [
            ...old.subDepartmentBoardGroups,
            {
              subDepartmentId: subDepartment.id,
              subDepartmentName: subDepartment.name,
              cards: [],
              members: [],
              statuses: subDepartmentStatuses,
              subDepartmentMembersForCreate: old.allProjectAssignees,
              boardSource: subDepartment.source,
              memberNames: subDepartment.memberNames,
            },
          ].sort((a, b) => a.subDepartmentName.localeCompare(b.subDepartmentName)),
        };
      });

      const result = await updateProjectBoards(project.id, {
        action: "add",
        subDepartmentId,
      });
      queryClient.setQueryData<ProjectDetailsResponse>(queryKey, (old) =>
        old ? { ...old, enabledBoardSubDepartmentIds: result.enabledBoardSubDepartmentIds } : old,
      );
      setCreatingBoardSubDepartmentId(null);
      setBoardAction(false);
      void queryClient.refetchQueries({ queryKey });
      startTransition(() => router.refresh());
    } catch (e) {
      if (previous) queryClient.setQueryData(queryKey, previous);
      toast.error(e instanceof Error ? e.message : "Failed to add board");
      setCreatingBoardSubDepartmentId(null);
      setBoardAction(false);
    }
  }

  const validTabs: Tab[] = useMemo(
    () => [
      "overview",
      "assets",
      "tickets",
      // Support projects don't use sprints
      ...(isSupport ? [] : (["sprints"] as Tab[])),
      ...subDepartmentBoardGroups.map((g) => `team:${g.subDepartmentId}` as Tab),
    ],
    [isPrivileged, subDepartmentBoardGroups, isSupport],
  );

  const { tab, setTab, isMounted } = useProjectTab({
    projectId: project.id,
    defaultTab,
    validTabs,
    subDepartmentBoardGroups,
    isPrivileged,
  });

  useEffect(() => {
    setFilterPriority(new Set());
    setFilterLabels(new Set());
    setFilterAssignee(new Set());
    setFilterModule(new Set());
  }, [tab]);

  const activeSubDepartmentBoard = useMemo(() => {
    if (!tab.startsWith("team:")) return null;
    const subDepartmentId = tab.slice(5);
    return subDepartmentBoardGroups.find((g) => g.subDepartmentId === subDepartmentId) ?? null;
  }, [tab, subDepartmentBoardGroups]);

  const activeBoardCards = activeSubDepartmentBoard?.cards ?? [];

  const boardLabelOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const card of activeBoardCards) {
      for (const label of card.labels) seen.add(label);
    }
    return [...seen].sort().map((label) => ({ id: label, label }));
  }, [activeBoardCards]);

  const boardAssigneeOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const card of activeBoardCards) {
      if (card.assigneeId && card.assigneeName) {
        byId.set(card.assigneeId, card.assigneeName);
      }
    }
    const opts = [...byId.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => ({ id, label: name }));
    if (activeBoardCards.some((c) => !c.assigneeId)) {
      opts.unshift({ id: "__unassigned__", label: "Unassigned" });
    }
    return opts;
  }, [activeBoardCards]);

  const boardModuleOptions = useMemo(() => {
    if (!project.moduleSystemEnabled) return [];
    const opts = project.modules.map((m) => ({ id: m.id, label: m.name }));
    if (activeBoardCards.some((c) => !c.moduleId)) {
      opts.unshift({ id: MODULE_ZERO_FILTER_ID, label: "Module 0 (General)" });
    }
    return opts;
  }, [project.moduleSystemEnabled, project.modules, activeBoardCards]);

  const boardFilters = useMemo<ProjectBoardFilters>(
    () => ({
      priority: filterPriority,
      labels: filterLabels,
      assignee: filterAssignee,
      module: filterModule,
    }),
    [filterPriority, filterLabels, filterAssignee, filterModule],
  );

  const activeBoardFilterCount =
    filterPriority.size + filterLabels.size + filterAssignee.size + filterModule.size;

  async function handleRemoveBoard(subDepartmentId: string) {
    if (!detailsQueryKey) return;

    const queryKey = projectDetailsKeys.detail(detailsQueryKey);
    const previous = queryClient.getQueryData<ProjectDetailsResponse>(queryKey);

    queryClient.setQueryData<ProjectDetailsResponse>(queryKey, (old) => {
      if (!old) return old;
      const group = old.subDepartmentBoardGroups.find((g) => g.subDepartmentId === subDepartmentId);
      const nextAddable = group
        ? [
            ...old.addableBoardSubDepartments,
            {
              id: group.subDepartmentId,
              name: group.subDepartmentName,
              source:
                group.boardSource === "department"
                  ? ("department" as const)
                  : ("member" as const),
              memberNames: group.memberNames,
              statuses: group.statuses,
            },
          ]
        : old.addableBoardSubDepartments;
      return {
        ...old,
        enabledBoardSubDepartmentIds: old.enabledBoardSubDepartmentIds.filter((id) => id !== subDepartmentId),
        subDepartmentBoardGroups: old.subDepartmentBoardGroups.filter((g) => g.subDepartmentId !== subDepartmentId),
        addableBoardSubDepartments: nextAddable.sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      };
    });

    if (tab === `team:${subDepartmentId}`) setTab("overview");
    setBoardMenu(null);

    setBoardAction(true);
    try {
      await updateProjectBoards(project.id, { action: "remove", subDepartmentId });
      await queryClient.refetchQueries({ queryKey });
      startTransition(() => router.refresh());
    } catch (e) {
      if (previous) queryClient.setQueryData(queryKey, previous);
      toast.error(e instanceof Error ? e.message : "Failed to remove board");
    } finally {
      setBoardAction(false);
    }
  }

  const subDepartmentBoardById = useMemo(
    () => new Map(subDepartmentBoardGroups.map((g) => [g.subDepartmentId, g])),
    [subDepartmentBoardGroups],
  );

  const PRIMARY_TABS: { id: Tab; label: string; icon: React.ElementType }[] =
    useMemo(
      () => [
        { id: "overview" as Tab, label: "Overview", icon: BarChart3 },
        { id: "tickets" as Tab, label: `All tasks (${stats.total})`, icon: List },
        // Support projects don't use sprints
        ...(isSupport
          ? []
          : [{ id: "sprints" as Tab, label: "Sprints", icon: Zap }]),
        ...subDepartmentBoardGroups.map((g) => ({
          id: `team:${g.subDepartmentId}` as Tab,
          label: `${g.subDepartmentName} (${g.cards.length})`,
          icon: LayoutGrid,
        })),
      ],
      [stats.total, subDepartmentBoardGroups, isSupport],
    );

  const UTILITY_TABS: { id: Tab; label: string; icon: React.ElementType }[] =
    useMemo(
      () => [
        { id: "assets", label: "Assets", icon: FolderOpen },
      ],
      [],
    );

  const renderTabButton = useCallback(
    (t: { id: Tab; label: string; icon: React.ElementType }) => {
      const Icon = t.icon;
      const isSubDepartmentTab = t.id.startsWith("team:");
      const subDepartmentId = isSubDepartmentTab ? t.id.slice(5) : null;
      const boardGroup = subDepartmentId ? subDepartmentBoardById.get(subDepartmentId) : undefined;
      const subDepartmentHint =
        boardGroup &&
        boardGroup.boardSource !== "department"
          ? boardSubDepartmentSourceLabel(boardGroup.boardSource, boardGroup.memberNames)
          : undefined;
      return (
        <button
          key={t.id}
          type="button"
          onClick={() => setTab(t.id)}
          title={subDepartmentHint}
          onContextMenu={
            canManageBoards && isSubDepartmentTab && boardGroup
              ? (e) => {
                  e.preventDefault();
                  setBoardMenu({
                    subDepartmentId: boardGroup.subDepartmentId,
                    subDepartmentName: boardGroup.subDepartmentName,
                    ticketCount: boardGroup.cards.length,
                    x: e.clientX,
                    y: e.clientY,
                  });
                }
              : undefined
          }
          className={cn(
            "flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 pb-3 font-sans text-[12px] whitespace-nowrap sm:px-3 sm:text-[12.5px]",
            tab === t.id
              ? "border-pen-id font-semibold text-pen-id"
              : "border-transparent text-pen-muted hover:text-pen-foreground",
          )}
        >
          <Icon className="size-3.5 shrink-0" />
          {t.label}
          {isSubDepartmentTab && creatingBoardSubDepartmentId === subDepartmentId && (
            <Loader2 className="size-3 shrink-0 animate-spin text-pen-id" />
          )}
          {(!creatingBoardSubDepartmentId || creatingBoardSubDepartmentId !== subDepartmentId) &&
            boardGroup &&
            boardGroup.boardSource === "member" && (
            <Users
              className="size-3 shrink-0 text-violet-500 dark:text-violet-400"
              aria-hidden
            />
          )}
        </button>
      );
    },
    [canManageBoards, creatingBoardSubDepartmentId, setTab, tab, subDepartmentBoardById],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {settingsOpen && canManageProjectSettings && (
        <ProjectModal
          mode={{
            type: "edit",
            project: detailsToModalProject(project, projectMemberUsers, stats.open),
          }}
          departments={createDepartments}
          lockedDepartment={lockedDepartment}
          onClose={() => setSettingsOpen(false)}
          onSuccess={() => {
            setSettingsOpen(false);
            if (detailsQueryKey) {
              void queryClient.invalidateQueries({
                queryKey: projectDetailsKeys.detail(detailsQueryKey),
              });
            }
            startTransition(() => router.refresh());
          }}
        />
      )}
      {!canModifyProject && canSelfJoinProject && !isSupport && (
        <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/5 px-4 py-2.5 sm:px-6 xl:px-8">
          <p className="font-sans text-[12.5px] leading-relaxed text-pen-muted">
            <span className="font-semibold text-pen-foreground">Read-only access.</span>{" "}
            You can browse this project as a department member, but you must be added to the
            project before creating tickets or making changes.
          </p>
        </div>
      )}
      {/* Header */}
      <div className="pen-page-header shrink-0 border-b border-pen-card-border bg-pen-card">
        <div className="mb-2 flex items-start gap-2.5 sm:mb-3 sm:gap-3">
          <ProjectAvatarEditor
            projectId={project.id}
            detailsQueryKey={detailsQueryKey}
            name={project.name}
            color={project.color ?? "#0a76b9"}
            avatarUrl={project.avatarUrl}
            size={24}
            canEdit={canEdit}
            className="mt-0.5"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                <h1 className="shrink-0 pen-text-page-title leading-tight">
                  {project.name}
                </h1>
                {!isSupport && (() => {
                  const stage = resolveCurrentStage(
                    project.lifecycleStages,
                    project.projectStatus,
                  );
                  if (!stage) return null;
                  const range = formatStageRange(stage);
                  return (
                    <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                      <span
                        className="flex items-center gap-1 rounded-full px-2.5 py-0.5 font-sans text-[11.5px] font-semibold"
                        style={{
                          backgroundColor: `${stage.color}22`,
                          color: stage.color,
                        }}
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: stage.color }}
                        />
                        {stage.label}
                      </span>
                      {range && (
                        <span className="font-mono text-[11.5px] text-pen-muted">
                          {range}
                        </span>
                      )}
                    </span>
                  );
                })()}
                {subDepartmentBoardGroups.length === 0 && project.subDepartmentName && (
                  <span className="shrink-0 rounded-full bg-pen-blue-tint px-2.5 py-0.5 font-sans text-[11.5px] font-medium whitespace-nowrap text-pen-id">
                    {project.subDepartmentName}
                  </span>
                )}
                <span className="shrink-0 whitespace-nowrap font-sans text-[11.5px] text-pen-subtle">
                  Created {formatDateTime(new Date(project.createdAt))}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <HeaderMemberAvatars
                  projectMembers={projectMemberUsers}
                  projectId={project.id}
                  detailsQueryKey={detailsQueryKey}
                  currentUserIsProjectMember={currentUserIsProjectMember}
                  canSelfJoinProject={canSelfJoinProject}
                />
                {canExport && <ProjectExportMenu projectId={project.id} />}
                {canManageProjectSettings && (
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    title="Project settings"
                    aria-label="Project settings"
                    className="flex size-7 items-center justify-center rounded-full border border-pen-card-border text-pen-muted transition-colors hover:border-pen-id hover:bg-pen-surface hover:text-pen-foreground"
                  >
                    <Settings className="size-3.5" strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs + view toggle */}
        <div className="flex w-full min-w-0 items-end">
          <div className="pen-header-scroll min-w-0 flex-1">
            <div className="flex w-max items-end gap-0.5">
              {PRIMARY_TABS.map(renderTabButton)}
              {canManageBoards && (
                <AddBoardButton
                  subDepartments={addableBoardSubDepartments}
                  onAdd={handleAddBoard}
                  adding={boardAction}
                  creatingSubDepartmentId={creatingBoardSubDepartmentId}
                />
              )}
              {boardMenu && (
                <BoardTabContextMenu
                  menu={boardMenu}
                  onClose={() => setBoardMenu(null)}
                  onRemove={() => handleRemoveBoard(boardMenu.subDepartmentId)}
                  removing={boardAction}
                />
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-end gap-0.5 overflow-x-auto border-l border-pen-card-border/60 pl-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {UTILITY_TABS.map(renderTabButton)}
            {tab.startsWith("team:") && (
              <>
                <span className="mb-2 hidden h-5 w-px shrink-0 bg-pen-card-border/80 sm:block" />
                <div className="mb-2 flex shrink-0 items-center gap-1">
                  <FilterDropdown
                    compact
                    label="Priority"
                    options={BOARD_PRIORITY_FILTER_OPTIONS}
                    selected={filterPriority}
                    onToggle={(id) =>
                      setFilterPriority((prev) => toggleFilterSet(prev, id))
                    }
                    onClear={() => setFilterPriority(new Set())}
                  />
                  {(boardLabelOptions.length > 0 || filterLabels.size > 0) && (
                    <FilterDropdown
                      compact
                      label="Labels"
                      options={boardLabelOptions}
                      selected={filterLabels}
                      onToggle={(id) =>
                        setFilterLabels((prev) => toggleFilterSet(prev, id))
                      }
                      onClear={() => setFilterLabels(new Set())}
                    />
                  )}
                  <FilterDropdown
                    compact
                    label="Assigned to"
                    options={boardAssigneeOptions}
                    selected={filterAssignee}
                    onToggle={(id) =>
                      setFilterAssignee((prev) => toggleFilterSet(prev, id))
                    }
                    onClear={() => setFilterAssignee(new Set())}
                  />
                  {project.moduleSystemEnabled && boardModuleOptions.length > 0 && (
                    <FilterDropdown
                      compact
                      label="Module"
                      options={boardModuleOptions}
                      selected={filterModule}
                      onToggle={(id) =>
                        setFilterModule((prev) => toggleFilterSet(prev, id))
                      }
                      onClear={() => setFilterModule(new Set())}
                    />
                  )}
                  {activeBoardFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilterPriority(new Set());
                        setFilterLabels(new Set());
                        setFilterAssignee(new Set());
                        setFilterModule(new Set());
                      }}
                      title="Clear filters"
                      className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-pen-card-border px-2 font-sans text-[11.5px] text-pen-muted transition-colors hover:border-pen-red hover:text-pen-red"
                    >
                      <X className="size-3 shrink-0" />
                      <span className="hidden sm:inline">Clear</span>
                    </button>
                  )}
                </div>
              </>
            )}
            {tab.startsWith("team:") && (
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 shrink-0 overflow-hidden rounded-md border border-pen-card-border bg-pen-card">
                  {(["board", "list"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setBoardView(v)}
                      aria-label={v === "board" ? "Board view" : "List view"}
                      className={cn(
                        "flex h-full items-center gap-1.5 px-2.5 font-sans text-[11.5px] font-medium transition-colors sm:px-3",
                        boardView === v
                          ? "bg-pen-blue-tint font-semibold text-pen-id"
                          : "text-pen-muted hover:text-pen-foreground",
                      )}
                    >
                      {v === "board" ? (
                        <LayoutGrid className="size-3 shrink-0" />
                      ) : (
                        <AlignJustify className="size-3 shrink-0" />
                      )}
                      <span className="hidden sm:inline">
                        {v === "board" ? "Board" : "List"}
                      </span>
                    </button>
                  ))}
                </div>
                {boardView === "board" && (
                  <div className="flex h-7 overflow-hidden rounded-md border border-pen-card-border bg-pen-card">
                    <button
                      type="button"
                      onClick={() =>
                        boardScrollerRef.current?.scrollBy({
                          left: -320,
                          behavior: "smooth",
                        })
                      }
                      className="flex h-[26px] w-7 items-center justify-center text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground"
                      aria-label="Scroll board left"
                    >
                      <ChevronLeft className="size-3.5 shrink-0" />
                    </button>
                    <span className="w-px self-stretch bg-pen-card-border" />
                    <button
                      type="button"
                      onClick={() =>
                        boardScrollerRef.current?.scrollBy({
                          left: 320,
                          behavior: "smooth",
                        })
                      }
                      className="flex h-[26px] w-7 items-center justify-center text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground"
                      aria-label="Scroll board right"
                    >
                      <ChevronRight className="size-3.5 shrink-0" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab content — stacked grid; panels mount lazily and stay cached */}
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-1 overflow-hidden">
        <ProjectTabPanel active={tab === "overview"} mounted={isMounted("overview")} layout="scroll-pad">
          <OverviewTab
            stats={stats}
            statusDist={statusDist}
            recentTickets={tickets}
            statuses={boardStatuses}
            projectId={project.id}
            projectSlug={project.slug}
            projectName={project.name}
            detailsQueryKey={detailsQueryKey}
            subDepartmentBoardGroups={subDepartmentBoardGroups}
            recentActivity={recentActivity}
            timeStats={timeStats}
            initialStatus={
              (project.projectStatus ?? "pipeline") as
                | "pipeline"
                | "in_development"
                | "live"
            }
            initialDescription={project.description}
            initialLifecycleStages={project.lifecycleStages}
            initialAssets={project.assets}
            canEdit={canEdit}
            canManageLifecycle={canManageLifecycle}
            onOpenAssets={() => setTab("assets")}
            supportProject={isSupport}
          />
        </ProjectTabPanel>
        <ProjectTabPanel active={tab === "assets"} mounted={isMounted("assets")} layout="scroll-pad">
          <ProjectAssetsTab
            projectId={project.id}
            initialAssets={project.assets}
            canAdd={canAddAssets}
            canDelete={canDeleteAssets}
          />
        </ProjectTabPanel>
        <ProjectTabPanel active={tab === "tickets"} mounted={isMounted("tickets")} layout="scroll-pad">
          <TicketList
            tickets={tickets}
            statuses={boardStatuses}
            projectId={project.id}
            projectSlug={project.slug}
            projectName={project.name}
            mainSubDepartmentId={mainSubDepartmentId}
            boardSubDepartments={subDepartmentBoardGroups.map((g) => ({
              id: g.subDepartmentId,
              name: g.subDepartmentName,
            }))}
            subDepartmentMembersForCreate={allProjectAssignees}
            detailsQueryKey={detailsQueryKey}
            supportProject={isSupport}
            canModifyProject={canModifyProject}
          />
        </ProjectTabPanel>
        {!isSupport && (
          <ProjectTabPanel active={tab === "sprints"} mounted={isMounted("sprints")} layout="scroll-pad">
            <ProjectSprintsTab
              projectId={project.id}
              canManage={canModifyProject}
            />
          </ProjectTabPanel>
        )}
        {subDepartmentBoardGroups.map((g) => {
          const subDepartmentTab = `team:${g.subDepartmentId}` as Tab;
          return (
            <ProjectTabPanel
              key={g.subDepartmentId}
              active={tab === subDepartmentTab}
              mounted={isMounted(subDepartmentTab)}
              layout="board"
            >
              <ProjectBoardPage
                name={g.subDepartmentName}
                description=""
                color={project.color}
                members={g.members.slice(0, 4)}
                extraMembers={Math.max(0, g.members.length - 4)}
                cards={g.cards}
                statuses={g.statuses}
                hideHeader
                moduleSystemEnabled={project.moduleSystemEnabled}
                projectId={project.id}
                projectName={project.name}
                projectSlug={project.slug}
                subDepartmentId={g.subDepartmentId}
                subDepartmentMembersForCreate={
                  allProjectAssignees.length > 0
                    ? allProjectAssignees
                    : g.subDepartmentMembersForCreate
                }
                externalView={boardView}
                scrollerRef={tab === subDepartmentTab ? boardScrollerRef : undefined}
                boardFilters={tab === subDepartmentTab ? boardFilters : undefined}
                supportProject={isSupport}
                canModifyProject={canModifyProject}
              />
            </ProjectTabPanel>
          );
        })}
      </div>
    </div>
  );
}
