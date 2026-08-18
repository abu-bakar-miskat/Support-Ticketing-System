"use client";

import { Suspense, use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import {
  Boxes,
  Edit2,
  Flame,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ProjectAvatar } from "@/components/projects/project-avatar";
import { DrawerLink } from "@/components/tickets/drawer-link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  labelColor,
  normalizeStatus,
  UI_PRIORITY_DOT_HEX,
  uiPriorityFromDb,
} from "@/components/board/board-types";
import { useModuleRollup, useDeleteModule } from "@/hooks/queries/use-modules";
import { ModuleFormDialog } from "@/components/modules/module-form-dialog";
import { ModuleStatusDialog } from "@/components/modules/module-status-dialog";
import { ModulesSectionsSkeleton } from "@/components/skeletons/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  ModuleRollup,
  ModuleStatus,
  ModuleTicket,
  ModuleWorkflowStatus,
} from "@/lib/api/modules";

const PROJECT_STORAGE_KEY = "pen.modules.selectedProject";

export type ModulesProjectOption = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  avatarUrl: string | null;
  moduleSystemEnabled: boolean;
  department: { id: string; name: string } | null;
};

type ProjectOption = ModulesProjectOption;

// ── Ranges ─────────────────────────────────────────────────────────────────────

const RANGES = [
  { key: "all", label: "All time", days: null },
  { key: "today", label: "Today", days: 0 },
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

function rangeStart(key: RangeKey): number | null {
  const range = RANGES.find((r) => r.key === key);
  if (!range || range.days === null) return null;
  if (range.days === 0) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  }
  return Date.now() - range.days * 86_400_000;
}

// ── Colors ─────────────────────────────────────────────────────────────────────

const TYPE_DOT: Record<string, string> = {
  Bug: "#dc2626",
  Feature: "#0a76b9",
  Task: "#16a34a",
  Chore: "#64748b",
};

const MODULE_STATUS_CONFIG: Record<
  ModuleStatus,
  { label: string; dot: string; bg: string; text: string }
> = {
  planned: {
    label: "Planned",
    dot: "bg-pen-subtle",
    bg: "bg-pen-surface",
    text: "text-pen-muted",
  },
  in_progress: {
    label: "In Progress",
    dot: "bg-pen-blue",
    bg: "bg-pen-blue-tint",
    text: "text-pen-blue",
  },
  completed: {
    label: "Completed",
    dot: "bg-pen-green",
    bg: "bg-[#e7f7ec] dark:bg-[#26352b]",
    text: "text-pen-green",
  },
};

function isUrgentTicket(t: ModuleTicket): boolean {
  return t.priority === "Urgent";
}

function isCriticalTicket(t: ModuleTicket): boolean {
  return t.priority === "Critical";
}

const PRIORITY_OPTIONS = ["Urgent", "Critical", "High", "Medium", "Low"] as const;

/** Count tickets by exact workflow label (not canonical buckets). */
function buildStatusCounts(
  tickets: ModuleTicket[],
  statuses: ModuleWorkflowStatus[],
): { label: string; color: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of tickets) {
    counts.set(t.status, (counts.get(t.status) ?? 0) + 1);
  }
  const seen = new Set<string>();
  const result: { label: string; color: string; count: number }[] = [];
  for (const s of statuses) {
    seen.add(s.label);
    result.push({ label: s.label, color: s.color, count: counts.get(s.label) ?? 0 });
  }
  for (const [label, count] of counts) {
    if (!seen.has(label)) {
      result.push({ label, color: "#94a3b8", count });
    }
  }
  return result;
}

// ── Small pieces ───────────────────────────────────────────────────────────────

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-w-[130px] flex-col gap-0.5 rounded-xl border border-pen-card-border bg-pen-card px-4 py-3">
      <span className="font-mono text-[22px] font-semibold text-pen-foreground">{value}</span>
      <span className="font-sans text-[12.5px] text-pen-subtle">{label}</span>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-sans text-[12.5px] text-pen-muted">
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function UrgentBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#ff4500]/10 px-2 py-0.5 font-sans text-[11px] font-semibold text-[#dd3300] dark:text-[#ff9466]">
      <Flame className="size-3" />
      {count} urgent
    </span>
  );
}

function CriticalBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-pen-red/10 px-2 py-0.5 font-sans text-[11px] font-semibold text-pen-red">
      {count} critical
    </span>
  );
}

function TicketRow({ ticket, indent }: { ticket: ModuleTicket; indent: boolean }) {
  return (
    <DrawerLink
      ticketId={ticket.id}
      href={`/tickets/${ticket.id}`}
      className={cn(
        "flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-pen-surface",
        indent && "ml-5 border-l border-pen-card-border pl-2.5",
      )}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: TYPE_DOT[ticket.type] ?? "#64748b" }}
        title={ticket.type}
      />
      <span className="shrink-0 font-mono text-[12px] font-semibold text-pen-id">
        {ticket.subDepartment.prefix}-{ticket.ticketNumber}
      </span>
      <span className="min-w-0 flex-1 truncate font-sans text-[13px] text-pen-foreground">
        {ticket.title}
      </span>
      {isUrgentTicket(ticket) && (
        <span className="shrink-0 rounded bg-[#ff4500]/10 px-1.5 py-px font-sans text-[10px] font-semibold text-[#dd3300] dark:text-[#ff9466]">
          urgent
        </span>
      )}
      {isCriticalTicket(ticket) && (
        <span className="shrink-0 rounded bg-pen-red/10 px-1.5 py-px font-sans text-[10px] font-semibold text-pen-red">
          critical
        </span>
      )}
      {ticket.storyPoints != null && (
        <span className="shrink-0 rounded bg-pen-surface px-1.5 py-px font-mono text-[10.5px] text-pen-muted">
          {ticket.storyPoints}
        </span>
      )}
      {ticket.assignee ? (
        <UserAvatar name={ticket.assignee.name} avatarUrl={ticket.assignee.avatarUrl} size={18} />
      ) : (
        <span className="size-[18px] shrink-0 rounded-full border border-dashed border-pen-card-border" />
      )}
    </DrawerLink>
  );
}

/** Order tickets so children directly follow their parent, and flag the indent. */
function nestTickets(tickets: ModuleTicket[]): { ticket: ModuleTicket; indent: boolean }[] {
  const ids = new Set(tickets.map((t) => t.id));
  const roots = tickets.filter((t) => !t.parentId || !ids.has(t.parentId));
  const childrenByParent = new Map<string, ModuleTicket[]>();
  for (const t of tickets) {
    if (t.parentId && ids.has(t.parentId)) {
      if (!childrenByParent.has(t.parentId)) childrenByParent.set(t.parentId, []);
      childrenByParent.get(t.parentId)!.push(t);
    }
  }
  const rows: { ticket: ModuleTicket; indent: boolean }[] = [];
  for (const root of roots) {
    rows.push({ ticket: root, indent: false });
    for (const child of childrenByParent.get(root.id) ?? []) {
      rows.push({ ticket: child, indent: true });
    }
  }
  return rows;
}

// ── Tickets slide-over panel ───────────────────────────────────────────────────

function ModuleTicketsPanel({
  title,
  tickets,
  statuses,
  initialStatus,
  onClose,
}: {
  title: string;
  tickets: ModuleTicket[];
  statuses: ModuleWorkflowStatus[];
  initialStatus: string | null;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<string | null>(initialStatus);
  const [label, setLabel] = useState<string | null>(null);
  const [priority, setPriority] = useState<string | null>(null);

  const statusCounts = useMemo(
    () => buildStatusCounts(tickets, statuses).filter((s) => s.count > 0),
    [tickets, statuses],
  );

  const labelCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tickets) {
      for (const l of t.labels) counts.set(l, (counts.get(l) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [tickets]);

  const priorityCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tickets) counts.set(t.priority, (counts.get(t.priority) ?? 0) + 1);
    return PRIORITY_OPTIONS.filter((p) => (counts.get(p) ?? 0) > 0).map((p) => ({
      priority: p,
      count: counts.get(p)!,
    }));
  }, [tickets]);

  const rows = useMemo(() => {
    let filtered = status
      ? tickets.filter((t) => t.status === status)
      : tickets;
    if (label) filtered = filtered.filter((t) => t.labels.includes(label));
    if (priority) filtered = filtered.filter((t) => t.priority === priority);
    return nestTickets(filtered);
  }, [tickets, status, label, priority]);

  return (
    <>
      <div className="fixed inset-0 z-40 pen-overlay-backdrop" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[440px] flex-col border-l border-pen-card-border bg-pen-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-pen-card-border px-4 py-3">
          <div>
            <h2 className="font-sans text-[15px] font-semibold text-pen-foreground">{title}</h2>
            <p className="font-sans text-[12.5px] text-pen-subtle">
              {rows.length} ticket{rows.length !== 1 ? "s" : ""}
              {status ? ` · ${status}` : ""}
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

        {/* Status filter chips — exact workflow labels */}
        <div className="flex flex-wrap gap-1.5 border-b border-pen-card-border px-4 py-2.5">
          <button
            type="button"
            onClick={() => setStatus(null)}
            className={cn(
              "rounded-lg border px-2.5 py-1 font-sans text-[12.5px] transition-colors",
              status === null
                ? "border-pen-blue/50 bg-pen-blue-tint text-pen-foreground"
                : "border-pen-card-border bg-pen-bg text-pen-muted hover:text-pen-foreground",
            )}
          >
            All ({tickets.length})
          </button>
          {statusCounts.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setStatus((prev) => (prev === s.label ? null : s.label))}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-sans text-[12.5px] transition-colors",
                status === s.label
                  ? "border-pen-blue/50 bg-pen-blue-tint text-pen-foreground"
                  : "border-pen-card-border bg-pen-bg text-pen-muted hover:text-pen-foreground",
              )}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.label} ({s.count})
            </button>
          ))}
        </div>

        {/* Priority filter chips */}
        {priorityCounts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b border-pen-card-border px-4 py-2.5">
            {priorityCounts.map((p) => (
              <button
                key={p.priority}
                type="button"
                onClick={() => setPriority((prev) => (prev === p.priority ? null : p.priority))}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-sans text-[12.5px] transition-colors",
                  priority === p.priority
                    ? "border-pen-blue/50 bg-pen-blue-tint text-pen-foreground"
                    : "border-pen-card-border bg-pen-bg text-pen-muted hover:text-pen-foreground",
                )}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: UI_PRIORITY_DOT_HEX[uiPriorityFromDb(p.priority)] }}
                />
                {p.priority} ({p.count})
              </button>
            ))}
          </div>
        )}

        {/* Label filter chips */}
        {labelCounts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b border-pen-card-border px-4 py-2.5">
            {labelCounts.map(([l, count]) => (
              <button
                key={l}
                type="button"
                onClick={() => setLabel((prev) => (prev === l ? null : l))}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-sans text-[12.5px] transition-colors",
                  label === l
                    ? "border-pen-blue/50 bg-pen-blue-tint text-pen-foreground"
                    : "border-pen-card-border bg-pen-bg text-pen-muted hover:text-pen-foreground",
                )}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: labelColor(l) }}
                />
                {l} ({count})
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-2.5 py-2">
          {rows.length === 0 ? (
            <p className="py-10 text-center font-sans text-[12.5px] text-pen-subtle">No tickets</p>
          ) : (
            rows.map(({ ticket, indent }) => (
              <TicketRow key={ticket.id} ticket={ticket} indent={indent} />
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ── Module card ────────────────────────────────────────────────────────────────

function ModuleCard({
  title,
  moduleStatus,
  description,
  tickets,
  statuses,
  rangeKey,
  isModuleZero = false,
  canManage,
  onEdit,
  onStatus,
  onDelete,
  onShowTickets,
}: {
  title: string;
  moduleStatus: ModuleStatus | null;
  description: string | null;
  /** Already filtered by the page-level urgent/priority filters. */
  tickets: ModuleTicket[];
  statuses: ModuleWorkflowStatus[];
  rangeKey: RangeKey;
  isModuleZero?: boolean;
  canManage: boolean;
  onEdit?: () => void;
  onStatus?: () => void;
  onDelete?: () => void;
  onShowTickets: (status: string | null) => void;
}) {
  const considered = tickets;

  const start = rangeStart(rangeKey);
  const rangeLabel = RANGES.find((r) => r.key === rangeKey)?.label ?? "All time";
  const createdInRange = considered.filter(
    (t) => !start || new Date(t.createdAt).getTime() >= start,
  ).length;
  const resolvedInRange = considered.filter(
    (t) => t.closedAt && (!start || new Date(t.closedAt).getTime() >= start),
  ).length;

  const urgentCount = tickets.filter(isUrgentTicket).length;
  const criticalCount = tickets.filter(isCriticalTicket).length;

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of considered) counts.set(t.type, (counts.get(t.type) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [considered]);

  const statusCounts = useMemo(
    () => buildStatusCounts(considered, statuses),
    [considered, statuses],
  );

  const labelCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of considered) {
      for (const l of t.labels) counts.set(l, (counts.get(l) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [considered]);

  const priorityCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of considered) counts.set(t.priority, (counts.get(t.priority) ?? 0) + 1);
    return PRIORITY_OPTIONS.filter((p) => (counts.get(p) ?? 0) > 0).map((p) => ({
      priority: p,
      count: counts.get(p)!,
    }));
  }, [considered]);

  const statusConfig = moduleStatus ? MODULE_STATUS_CONFIG[moduleStatus] : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onShowTickets(null)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onShowTickets(null);
        }
      }}
      className="flex h-full cursor-pointer flex-col rounded-2xl border border-pen-card-border bg-pen-card p-5 text-left transition-colors hover:border-pen-subtle/50"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate font-sans text-[16px] font-semibold text-pen-foreground">
            {title}
          </h3>
          {statusConfig && (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-sans text-[10.5px] font-medium",
                statusConfig.bg,
                statusConfig.text,
              )}
            >
              <span className={cn("size-1 rounded-full", statusConfig.dot)} />
              {statusConfig.label}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <UrgentBadge count={urgentCount} />
          <CriticalBadge count={criticalCount} />
          {!isModuleZero && canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-pen-subtle outline-none hover:bg-pen-surface hover:text-pen-foreground"
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={onEdit} className="gap-2 font-sans text-[12.5px]">
                  <Edit2 className="size-3.5" /> Edit module
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onStatus} className="gap-2 font-sans text-[12.5px]">
                  <RefreshCw className="size-3.5" /> Change status
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onDelete}
                  className="gap-2 font-sans text-[12.5px] text-pen-red focus:text-pen-red"
                >
                  <Trash2 className="size-3.5" /> Delete module
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Range figures */}
      <p className="mt-1 font-sans text-[12.5px] text-pen-subtle">
        {rangeLabel}: +{createdInRange} created, {resolvedInRange} resolved
      </p>
      {description && (
        <p className="mt-1 line-clamp-2 font-sans text-[12.5px] text-pen-subtle/80">{description}</p>
      )}

      {/* Type breakdown */}
      {typeCounts.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {typeCounts.map(([type, count]) => (
            <span key={type} className="inline-flex items-center gap-1.5 font-sans text-[12.5px] text-pen-muted">
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: TYPE_DOT[type] ?? "#64748b" }}
              />
              <span className="font-semibold text-pen-foreground">{count}</span>
              {type.toLowerCase()}
            </span>
          ))}
        </div>
      )}

      {/* Priority breakdown */}
      {priorityCounts.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {priorityCounts.map((p) => (
            <span
              key={p.priority}
              className="inline-flex items-center gap-1.5 font-sans text-[12.5px] text-pen-muted"
            >
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: UI_PRIORITY_DOT_HEX[uiPriorityFromDb(p.priority)] }}
              />
              <span className="font-semibold text-pen-foreground">{p.count}</span>
              {p.priority.toLowerCase()}
            </span>
          ))}
        </div>
      )}

      {/* Label breakdown */}
      {labelCounts.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {labelCounts.map(([l, count]) => (
            <span key={l} className="inline-flex items-center gap-1.5 font-sans text-[12px] text-pen-muted">
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: labelColor(l) }}
              />
              <span className="font-semibold text-pen-foreground">{count}</span>
              <span className="max-w-[110px] truncate">{l}</span>
            </span>
          ))}
        </div>
      )}

      {/* Status chips — every project workflow status (exact labels) */}
      {considered.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {statusCounts.map(({ label: statusLabel, color, count }) => (
            <button
              key={statusLabel}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onShowTickets(statusLabel);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border border-pen-card-border bg-pen-bg px-2.5 py-1.5 font-sans text-[12.5px] transition-colors hover:border-pen-subtle/60 hover:text-pen-foreground",
                count === 0 ? "text-pen-subtle/70" : "text-pen-muted",
              )}
            >
              <span
                className={cn(
                  "font-semibold",
                  count === 0 ? "text-pen-subtle" : "text-pen-foreground",
                )}
              >
                {count}
              </span>
              <span className="inline-flex items-center gap-1">
                <span
                  className="size-1.5 rounded-full"
                  style={{
                    backgroundColor: color,
                    opacity: count === 0 ? 0.45 : 1,
                  }}
                />
                {statusLabel}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-3 font-sans text-[13px] text-pen-subtle">
          No tickets match the current filters.
        </p>
      )}

    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

function ModulesProjectsFallback() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {[96, 110, 88].map((w, i) => (
          <Skeleton key={i} className="h-9 rounded-lg" style={{ width: w }} />
        ))}
      </div>
      <ModulesSectionsSkeleton />
    </>
  );
}

function ModulesBody({
  projectsPromise,
  canManage,
  rangeKey,
  urgentOnly,
  priorityFilter,
}: {
  projectsPromise: Promise<ProjectOption[]>;
  canManage: boolean;
  rangeKey: RangeKey;
  urgentOnly: boolean;
  priorityFilter: Set<string>;
}) {
  const router = useRouter();
  const allProjects = use(projectsPromise);
  const enabledProjects = useMemo(
    () => allProjects.filter((p) => p.moduleSystemEnabled),
    [allProjects],
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<ModuleRollup | null>(null);
  const [statusTarget, setStatusTarget] = useState<ModuleRollup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ModuleRollup | null>(null);
  const [ticketPanel, setTicketPanel] = useState<{
    title: string;
    tickets: ModuleTicket[];
    initialStatus: string | null;
  } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(PROJECT_STORAGE_KEY);
    if (stored && enabledProjects.some((p) => p.id === stored)) {
      setSelectedProjectId(stored);
    } else if (enabledProjects.length > 0) {
      setSelectedProjectId(enabledProjects[0].id);
    } else {
      setSelectedProjectId(null);
    }
    setReady(true);
  }, [enabledProjects]);

  useEffect(() => {
    if (ready && selectedProjectId) {
      localStorage.setItem(PROJECT_STORAGE_KEY, selectedProjectId);
    }
  }, [ready, selectedProjectId]);

  const { data, isLoading, error } = useModuleRollup(selectedProjectId);

  const deleteMutation = useDeleteModule({
    onSuccess: () => {
      toast.success("Module deleted — its tickets moved to Module 0");
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const filterTickets = useMemo(() => {
    return (arr: ModuleTicket[]) =>
      arr.filter(
        (t) =>
          (!urgentOnly || isUrgentTicket(t)) &&
          (priorityFilter.size === 0 || priorityFilter.has(t.priority)),
      );
  }, [urgentOnly, priorityFilter]);

  const allTickets = useMemo(() => {
    if (!data) return [];
    return [...data.modules.flatMap((m) => m.tickets), ...data.moduleZero.tickets];
  }, [data]);

  const summary = useMemo(() => {
    const considered = filterTickets(allTickets);
    const start = rangeStart(rangeKey);
    return {
      total: considered.length,
      urgent: allTickets.filter(isUrgentTicket).length,
      critical: allTickets.filter(isCriticalTicket).length,
      blocked: considered.filter((t) => normalizeStatus(t.status) === "Blocked").length,
      resolvedInRange: considered.filter(
        (t) => t.closedAt && (!start || new Date(t.closedAt).getTime() >= start),
      ).length,
    };
  }, [allTickets, filterTickets, rangeKey]);

  const selectedProject =
    allProjects.find((p) => p.id === selectedProjectId) ?? null;

  const createDefaultProjectId =
    selectedProjectId ?? allProjects[0]?.id ?? "";

  const newModuleButton =
    canManage && allProjects.length > 0 ? (
      <Button
        size="sm"
        onClick={() => { setEditTarget(null); setShowForm(true); }}
        className="ml-auto h-8 gap-1.5 bg-pen-blue font-sans text-[12px] text-white dark:text-gray-900 hover:bg-pen-blue/90"
      >
        <Plus className="size-3.5" />
        New module
      </Button>
    ) : null;

  const formDialog = createDefaultProjectId ? (
    <ModuleFormDialog
      key={editTarget?.id ?? "new"}
      open={showForm}
      onOpenChange={setShowForm}
      projectId={createDefaultProjectId}
      projects={allProjects}
      module={editTarget}
      onCreated={(id) => {
        setSelectedProjectId(id);
        router.refresh();
      }}
    />
  ) : null;

  if (allProjects.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-pen-card-border py-16">
        <Boxes className="size-8 text-pen-subtle" />
        <p className="font-sans text-[13px] font-medium text-pen-foreground">
          No projects in this department
        </p>
        <p className="max-w-sm text-center font-sans text-[12px] text-pen-subtle">
          Create a project first, then add modules to organize its tickets.
        </p>
      </div>
    );
  }

  if (enabledProjects.length === 0) {
    return (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <span className="shrink-0 font-sans text-[11px] font-semibold uppercase tracking-wide text-pen-subtle">
            Project
          </span>
          {newModuleButton}
        </div>
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-pen-card-border py-16">
          <Boxes className="size-8 text-pen-subtle" />
          <p className="font-sans text-[13px] font-medium text-pen-foreground">
            No modules yet
          </p>
          <p className="max-w-sm text-center font-sans text-[12px] text-pen-subtle">
            {canManage
              ? "Create a module for any project — that turns on the module system for it automatically."
              : "Managers haven't enabled modules for any project yet."}
          </p>
        </div>
        {formDialog}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0 font-sans text-[11px] font-semibold uppercase tracking-wide text-pen-subtle">
          Project
        </span>
        {enabledProjects.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelectedProjectId(p.id)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-1.5 font-sans text-[12.5px] transition-colors",
              p.id === selectedProjectId
                ? "border-pen-blue/50 bg-pen-blue-tint text-pen-foreground"
                : "border-pen-card-border bg-pen-surface text-pen-muted hover:text-pen-foreground",
            )}
          >
            <ProjectAvatar name={p.name} color={p.color ?? "#0a76b9"} avatarUrl={p.avatarUrl} size={18} />
            {p.name}
          </button>
        ))}
        {newModuleButton}
      </div>

      {(!ready || isLoading) && <ModulesSectionsSkeleton />}

      {error instanceof Error && !isLoading && ready && (
        <p className="py-8 text-center font-sans text-[13px] text-pen-red">{error.message}</p>
      )}

      {data && !isLoading && ready && (
        <>
          <div className="flex flex-wrap gap-3">
            <StatCard value={summary.total} label="Total tickets" />
            <StatCard value={summary.urgent} label="Urgent" />
            <StatCard value={summary.critical} label="Critical" />
            <StatCard value={summary.blocked} label="Blocked" />
            <StatCard value={summary.resolvedInRange} label="Resolved in range" />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {(data.statuses ?? []).map((s) => (
              <LegendDot key={s.label} color={s.color} label={s.label} />
            ))}
            <span className="h-3 w-px bg-pen-card-border" />
            {Object.entries(TYPE_DOT).map(([type, color]) => (
              <LegendDot key={type} color={color} label={type} />
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="border-t border-pen-card-border pt-4 font-sans text-[15px] font-semibold text-pen-foreground">
              By module
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {data.modules.map((m) => (
                <ModuleCard
                  key={m.id}
                  title={m.name}
                  moduleStatus={m.status}
                  description={m.description}
                  tickets={filterTickets(m.tickets)}
                  statuses={data.statuses ?? []}
                  rangeKey={rangeKey}
                  canManage={canManage}
                  onEdit={() => { setEditTarget(m); setShowForm(true); }}
                  onStatus={() => setStatusTarget(m)}
                  onDelete={() => setDeleteTarget(m)}
                  onShowTickets={(status) =>
                    setTicketPanel({
                      title: m.name,
                      tickets: filterTickets(m.tickets),
                      initialStatus: status,
                    })
                  }
                />
              ))}
              <ModuleCard
                title="Module 0 · General"
                moduleStatus={null}
                description="Tickets not assigned to any module."
                tickets={filterTickets(data.moduleZero.tickets)}
                statuses={data.statuses ?? []}
                rangeKey={rangeKey}
                isModuleZero
                canManage={canManage}
                onShowTickets={(status) =>
                  setTicketPanel({
                    title: "Module 0 · General",
                    tickets: filterTickets(data.moduleZero.tickets),
                    initialStatus: status,
                  })
                }
              />
            </div>

            {data.modules.length === 0 && (
              <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-pen-card-border py-10">
                <p className="font-sans text-[13px] font-medium text-pen-foreground">
                  No modules yet
                </p>
                <p className="font-sans text-[12px] text-pen-subtle">
                  {canManage
                    ? "Create the first module to start sub-categorizing this project."
                    : "Managers haven't created any modules for this project yet."}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {ticketPanel && (
        <ModuleTicketsPanel
          title={ticketPanel.title}
          tickets={ticketPanel.tickets}
          statuses={data?.statuses ?? []}
          initialStatus={ticketPanel.initialStatus}
          onClose={() => setTicketPanel(null)}
        />
      )}

      {formDialog}
      {selectedProject && statusTarget && (
        <ModuleStatusDialog
          open={!!statusTarget}
          onOpenChange={(next) => { if (!next) setStatusTarget(null); }}
          projectId={selectedProject.id}
          moduleId={statusTarget.id}
          moduleName={statusTarget.name}
          currentStatus={statusTarget.status}
        />
      )}

      <AlertDialog.Root
        open={!!deleteTarget}
        onOpenChange={(next) => { if (!next && !deleteMutation.isPending) setDeleteTarget(null); }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-50 pen-overlay-backdrop" />
          <AlertDialog.Popup className="pen-glass-panel fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-pen-card-border p-6 shadow-2xl">
            <AlertDialog.Title className="pen-text-modal-title">Delete module</AlertDialog.Title>
            <AlertDialog.Description className="mt-1.5 font-sans text-[13px] text-pen-subtle">
              Tickets in this module won&apos;t be deleted — they&apos;ll move back to Module 0 (General).
            </AlertDialog.Description>
            {deleteTarget && (
              <p className="mt-3 rounded-lg border border-pen-card-border bg-pen-surface px-3 py-2 font-sans text-[12.5px] text-pen-foreground">
                {deleteTarget.name}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={deleteMutation.isPending}
                onClick={() => setDeleteTarget(null)}
                className="font-sans text-[12px]"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (deleteTarget && selectedProjectId) {
                    deleteMutation.mutate({ id: deleteTarget.id, projectId: selectedProjectId });
                  }
                }}
                className="gap-1.5 font-sans text-[12px]"
              >
                {deleteMutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
                Delete
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}

export function ModulesPage({
  projectsPromise,
  canManage,
}: {
  projectsPromise: Promise<ProjectOption[]>;
  canManage: boolean;
}) {
  const [rangeKey, setRangeKey] = useState<RangeKey>("all");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<Set<string>>(new Set());

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex w-full flex-col gap-5 px-4 py-5 sm:px-5">
        <PageHeader
          title="Modules"
          icon={Boxes}
          iconClassName="text-pen-blue"
          description="Ticket overview per module — counts reflect current state; the date range changes the created/resolved figures."
          actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-8 overflow-hidden rounded-lg border border-pen-card-border bg-pen-surface">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRangeKey(r.key)}
                  className={cn(
                    "px-3 font-sans text-[12px] transition-colors",
                    rangeKey === r.key
                      ? "bg-pen-card font-semibold text-pen-foreground shadow-sm"
                      : "text-pen-muted hover:text-pen-foreground",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <div className="flex h-8 items-center gap-1 rounded-lg border border-pen-card-border bg-pen-surface px-1.5">
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  title={`Priority: ${p}`}
                  onClick={() =>
                    setPriorityFilter((prev) => {
                      const next = new Set(prev);
                      if (next.has(p)) next.delete(p);
                      else next.add(p);
                      return next;
                    })
                  }
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2 py-1 font-sans text-[12px] transition-colors",
                    priorityFilter.has(p)
                      ? "bg-pen-card font-semibold text-pen-foreground shadow-sm"
                      : "text-pen-muted hover:text-pen-foreground",
                  )}
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: UI_PRIORITY_DOT_HEX[uiPriorityFromDb(p)] }}
                  />
                  {p}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setUrgentOnly((v) => !v)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg border px-3 font-sans text-[12px] font-medium transition-colors",
                urgentOnly
                  ? "border-[#ff4500]/50 bg-[#ff4500]/10 text-[#dd3300] dark:text-[#ff9466]"
                  : "border-pen-card-border bg-pen-surface text-pen-muted hover:text-pen-foreground",
              )}
            >
              <Flame className="size-3.5" />
              Urgent only
            </button>
          </div>
          }
        />

        <Suspense fallback={<ModulesProjectsFallback />}>
          <ModulesBody
            projectsPromise={projectsPromise}
            canManage={canManage}
            rangeKey={rangeKey}
            urgentOnly={urgentOnly}
            priorityFilter={priorityFilter}
          />
        </Suspense>
      </div>
    </div>
  );
}
