"use client";

import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Plus, Search, Upload, Zap } from "lucide-react";
import { toast } from "sonner";
import { notifyMutationError } from "@/lib/notify-mutation-error";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { SprintStatus } from "@/lib/api/sprints";
import { useSprints, useDeleteSprint } from "@/hooks/queries/use-sprints";
import { SprintsOverviewSectionsSkeleton } from "@/components/skeletons/page-skeletons";
import { SprintFormDialog } from "@/components/sprints/sprint-form-dialog";
import { SprintStatusDialog } from "@/components/sprints/sprint-status-dialog";
import { SprintCSVImport } from "@/components/sprints/sprint-csv-import";
import { SprintDetailDialog } from "@/components/sprints/sprint-detail-dialog";

// ── Types ─────────────────────────────────────────────────────────────────────

type SprintRow = {
  id: string;
  name: string;
  goal: string | null;
  dates: string;
  status: SprintStatus;
  points: number;
  completed?: number;
  startDate: string;
  endDate: string;
  pointsTarget: number | null;
  projectId: string | null;
};

type ActiveSprintData = {
  id: string;
  name: string;
  dates: string;
  daysLeft: string;
  daysLeftUrgent: boolean;
  totalTickets: number;
  doneTickets: number;
  totalPoints: number;
  donePoints: number;
  inProgress: number;
  progress: number;
  progressLabel: string;
  isOnTrack: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateRange(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function daysLeftLabel(endDate: Date, now: Date): string {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfEnd = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate(),
  );
  const dayDiff = Math.round(
    (startOfEnd.getTime() - startOfToday.getTime()) / 86_400_000,
  );
  if (dayDiff < 0) return "Ended";
  if (dayDiff === 0) return "Ends today";
  if (dayDiff === 1) return "1 day left";
  return `${dayDiff} days left`;
}

const STATUS_CONFIG: Record<
  SprintStatus,
  { label: string; dot: string; bg: string; text: string }
> = {
  planned: {
    label: "Planned",
    dot: "bg-pen-subtle",
    bg: "bg-pen-surface",
    text: "text-pen-muted",
  },
  active: {
    label: "Active",
    dot: "bg-pen-blue",
    bg: "bg-[#e7f7ec] dark:bg-[#26352b]",
    text: "text-pen-green",
  },
  completed: {
    label: "Completed",
    dot: "bg-pen-id",
    bg: "bg-pen-blue-tint",
    text: "text-pen-id",
  },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: SprintStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-sans text-[11.5px] font-medium",
        cfg.bg,
        cfg.text,
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

function ProgressBar({
  value,
  variant = "active",
  className,
}: {
  value: number;
  variant?: "active" | "completed";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-[3px] bg-pen-surface",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-[3px] transition-[width]",
          variant === "completed" ? "bg-pen-id" : "bg-pen-blue",
        )}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function SprintRowMenu({
  sprint,
  onView,
  onEdit,
  onStatus,
  onDelete,
}: {
  sprint: SprintRow;
  onView: (sprint: SprintRow) => void;
  onEdit: (sprint: SprintRow) => void;
  onStatus: (sprint: SprintRow) => void;
  onDelete: (sprint: SprintRow) => void;
}) {
  const canTransition = sprint.status !== "completed";
  const statusLabel =
    sprint.status === "planned" ? "Start sprint" : "Complete sprint";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        className="inline-flex size-7 items-center justify-center rounded-md text-pen-muted outline-none hover:bg-pen-surface hover:text-pen-foreground"
        aria-label="Sprint actions"
      >
        <MoreHorizontal className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[150px]">
        <DropdownMenuItem onClick={() => onView(sprint)}>
          View details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(sprint)}>
          Edit sprint
        </DropdownMenuItem>
        {canTransition && (
          <DropdownMenuItem onClick={() => onStatus(sprint)}>
            {statusLabel}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={() => onDelete(sprint)}
          className="text-pen-red focus:text-pen-red"
        >
          Delete sprint
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function ProjectSprintsTab({
  projectId,
  canManage,
}: {
  projectId: string;
  canManage: boolean;
}) {
  const { data: sprintData } = useSprints(projectId);

  const deleteMutation = useDeleteSprint({
    onSuccess: () => {
      toast.success("Sprint deleted");
      setDeleteSprint(null);
    },
    onError: notifyMutationError,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [detailSprintId, setDetailSprintId] = useState<string | null>(null);
  const [editSprint, setEditSprint] = useState<SprintRow | null>(null);
  const [statusSprint, setStatusSprint] = useState<SprintRow | null>(null);
  const [deleteSprint_, setDeleteSprint] = useState<SprintRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const { rows, activeSprints } = useMemo(() => {
    if (!sprintData) return { rows: [] as SprintRow[], activeSprints: [] as ActiveSprintData[] };

    const now = new Date();

    const computed = sprintData.map((sprint) => {
      const totalPoints = sprint.tickets.reduce(
        (sum, t) => sum + (t.storyPoints ?? 0),
        0,
      );
      const completedPoints = sprint.tickets
        .filter((t) => t.isDone)
        .reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
      const totalTickets = sprint.tickets.length;
      const doneTickets = sprint.tickets.filter((t) => t.isDone).length;
      const inProgressCount = sprint.tickets.filter(
        (t) => !t.isDone && t.status !== "To Do",
      ).length;
      const completionPct =
        totalTickets > 0 ? Math.round((doneTickets / totalTickets) * 100) : 0;

      return {
        sprint,
        totalPoints,
        completedPoints,
        totalTickets,
        doneTickets,
        inProgressCount,
        completionPct,
      };
    });

    const activeSprints: ActiveSprintData[] = computed
      .filter((c) => c.sprint.status === "active")
      .map((c) => {
        const { sprint } = c;
        const startDate = new Date(sprint.startDate);
        const endDate = new Date(sprint.endDate);
        const totalMs = endDate.getTime() - startDate.getTime();
        const elapsedPct =
          totalMs > 0
            ? Math.min(
                100,
                Math.max(0, ((now.getTime() - startDate.getTime()) / totalMs) * 100),
              )
            : 0;
        const daysLeftStr = daysLeftLabel(endDate, now);
        return {
          id: sprint.id,
          name: sprint.name,
          dates: formatDateRange(startDate, endDate),
          daysLeft: daysLeftStr,
          daysLeftUrgent:
            daysLeftStr === "Ends today" ||
            daysLeftStr === "1 day left" ||
            daysLeftStr === "Ended",
          totalTickets: c.totalTickets,
          doneTickets: c.doneTickets,
          totalPoints: c.totalPoints,
          donePoints: c.completedPoints,
          inProgress: c.inProgressCount,
          progress: c.completionPct,
          progressLabel:
            c.completionPct >= elapsedPct - 10 ? "on track" : "behind",
          isOnTrack: c.completionPct >= elapsedPct - 10,
        };
      });

    const STATUS_ORDER: Record<SprintStatus, number> = {
      active: 0,
      planned: 1,
      completed: 2,
    };

    const rows: SprintRow[] = computed
      .map((c) => ({
        id: c.sprint.id,
        name: c.sprint.name,
        goal: c.sprint.goal,
        dates: formatDateRange(
          new Date(c.sprint.startDate),
          new Date(c.sprint.endDate),
        ),
        status: c.sprint.status as SprintStatus,
        points: c.totalPoints,
        completed: c.sprint.status === "planned" ? undefined : c.completionPct,
        startDate: c.sprint.startDate,
        endDate: c.sprint.endDate,
        pointsTarget: c.sprint.pointsTarget,
        projectId: c.sprint.projectId,
      }))
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

    return { rows, activeSprints };
  }, [sprintData]);

  const filteredRows = rows.filter(
    (r) =>
      !debouncedSearch ||
      r.name.toLowerCase().includes(debouncedSearch.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-pen-blue" />
          <h2 className="font-sans text-[14px] font-semibold text-pen-foreground">
            Sprints
          </h2>
          {activeSprints.length > 0 && (
            <span className="rounded-full bg-[#e7f7ec] px-1.5 py-px font-mono text-[11.5px] text-pen-green dark:bg-[#26352b]">
              {activeSprints.length} active
            </span>
          )}
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setImportOpen(true)}
              className="h-[30px] shrink-0 gap-1.5 font-sans text-[11.5px] font-medium"
            >
              <Upload className="size-3" /> Import CSV
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="h-[30px] shrink-0 gap-1.5 bg-pen-blue px-3 font-sans text-[11.5px] font-medium text-white hover:bg-pen-blue/90 dark:text-gray-900"
            >
              <Plus className="size-3" /> New sprint
            </Button>
          </div>
        )}
      </div>

      {!sprintData && <SprintsOverviewSectionsSkeleton />}

      {sprintData && (
        <>
          {/* Active sprint cards */}
          {activeSprints.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="font-sans text-[11.5px] font-medium tracking-[0.9px] text-pen-subtle uppercase">
                Running now
              </p>
              <div
                className={cn(
                  "grid gap-3",
                  activeSprints.length === 1
                    ? "grid-cols-1 max-w-[520px]"
                    : "grid-cols-1 sm:grid-cols-2",
                )}
              >
                {activeSprints.map((s) => (
                  <section
                    key={s.id}
                    onClick={() => setDetailSprintId(s.id)}
                    className="flex cursor-pointer flex-col gap-3 rounded-xl border border-pen-card-border bg-pen-card px-4 py-4 ring-1 ring-pen-blue/25 transition-colors hover:bg-pen-surface"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="size-[7px] shrink-0 rounded-full bg-pen-green" />
                          <span className="pen-text-card-title truncate">
                            {s.name}
                          </span>
                        </div>
                        <span className="font-mono text-[11.5px] text-pen-muted">
                          {s.dates}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 font-sans text-[11.5px] font-medium",
                          s.daysLeftUrgent
                            ? "bg-pen-red/10 text-pen-red"
                            : "bg-pen-surface text-pen-muted",
                        )}
                      >
                        {s.daysLeft}
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-2 border-t border-[#f0f4f8] pt-3 dark:border-[#3a3a37]">
                      {[
                        { value: `${s.doneTickets}/${s.totalTickets}`, label: "TICKETS" },
                        { value: `${s.donePoints}/${s.totalPoints}`, label: "POINTS" },
                        { value: String(s.inProgress), label: "IN PROG." },
                        { value: `${s.progress}%`, label: "DONE" },
                      ].map((stat) => (
                        <div key={stat.label} className="flex flex-col gap-0.5">
                          <span className="font-mono text-[13px] font-semibold text-pen-foreground">
                            {stat.value}
                          </span>
                          <span className="font-sans text-[11.5px] tracking-[0.6px] text-pen-subtle">
                            {stat.label}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col gap-1">
                      <ProgressBar value={s.progress} />
                      <span
                        className={cn(
                          "font-sans text-[11.5px]",
                          s.isOnTrack ? "text-pen-green" : "text-pen-red",
                        )}
                      >
                        {s.progressLabel}
                      </span>
                    </div>
                  </section>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-pen-card-border py-12">
              <p className="font-sans text-[13px] font-medium text-pen-muted">
                No active sprints
              </p>
              <p className="font-sans text-[11.5px] text-pen-subtle">
                {canManage
                  ? "Start a planned sprint or create a new one."
                  : "No sprint is currently running for this project."}
              </p>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="mt-2 flex items-center gap-1.5 rounded-lg bg-pen-blue px-3 py-1.5 font-sans text-[12px] font-medium text-white hover:bg-pen-blue/90"
                >
                  <Plus className="size-3" /> New sprint
                </button>
              )}
            </div>
          )}

          {/* All sprints table */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-pen-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search sprints…"
                  className="h-[30px] rounded-[7px] border border-pen-card-border bg-pen-card pl-8 pr-3 font-sans text-[12px] text-pen-foreground outline-none placeholder:text-pen-muted focus:border-pen-blue"
                />
              </div>
              <span className="font-sans text-[11.5px] text-pen-subtle">
                {filteredRows.length} sprint{filteredRows.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="overflow-hidden rounded-xl border border-pen-card-border bg-pen-card">
              <div className="overflow-x-auto">
                <table className="w-full caption-bottom text-sm">
                  <thead className="bg-pen-card [&_tr]:border-b">
                    <tr className="h-[34px] border-pen-card-border">
                      <th className="min-w-[140px] pl-[18px] text-left font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle whitespace-nowrap">
                        SPRINT
                      </th>
                      <th className="hidden min-w-[160px] sm:table-cell text-left font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle whitespace-nowrap">
                        DATES
                      </th>
                      <th className="hidden min-w-[100px] md:table-cell text-left font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle whitespace-nowrap">
                        STATUS
                      </th>
                      <th className="hidden min-w-[90px] lg:table-cell text-left font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle whitespace-nowrap">
                        POINTS
                      </th>
                      <th className="min-w-[120px] text-left font-sans text-[11.5px] font-semibold tracking-[1px] text-pen-subtle whitespace-nowrap">
                        COMPLETED
                      </th>
                      <th className="w-10 pr-[18px]" />
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {filteredRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="h-[52px] pl-[18px] font-sans text-[12.5px] text-pen-muted"
                        >
                          {rows.length === 0
                            ? "No sprints yet for this project."
                            : `No sprints match "${debouncedSearch}".`}
                        </td>
                      </tr>
                    )}
                    {filteredRows.map((sprint) => {
                      const cfg = STATUS_CONFIG[sprint.status];
                      return (
                        <tr
                          key={sprint.id}
                          onClick={() => setDetailSprintId(sprint.id)}
                          className="h-[52px] cursor-pointer border-b border-[#f0f4f8] transition-colors hover:bg-pen-bg dark:border-[#3a3a37]"
                        >
                          <td className="p-2 pl-[18px] align-middle whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn("size-2 shrink-0 rounded-full", cfg.dot)}
                              />
                              <span className="font-sans text-[13px] font-semibold text-pen-foreground">
                                {sprint.name}
                              </span>
                            </div>
                          </td>
                          <td className="hidden p-2 align-middle whitespace-nowrap sm:table-cell">
                            <span className="font-mono text-[11.5px] text-pen-muted">
                              {sprint.dates}
                            </span>
                          </td>
                          <td className="hidden p-2 align-middle md:table-cell">
                            <StatusPill status={sprint.status} />
                          </td>
                          <td className="hidden p-2 align-middle whitespace-nowrap lg:table-cell">
                            <span className="font-mono text-xs font-semibold text-pen-foreground">
                              {sprint.points} pts
                            </span>
                          </td>
                          <td className="p-2 align-middle">
                            {sprint.completed != null ? (
                              <div className="flex max-w-[160px] flex-col gap-1">
                                <span className="font-mono text-[11.5px] font-medium text-pen-muted">
                                  {sprint.completed}%
                                </span>
                                <ProgressBar
                                  value={sprint.completed}
                                  variant={
                                    sprint.status === "completed"
                                      ? "completed"
                                      : "active"
                                  }
                                  className="max-w-[159px]"
                                />
                              </div>
                            ) : (
                              <span className="font-mono text-[11.5px] font-medium text-pen-muted">
                                —
                              </span>
                            )}
                          </td>
                          <td
                            className="p-2 pr-[18px] text-right align-middle"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {canManage ? (
                              <SprintRowMenu
                                sprint={sprint}
                                onView={(s) => setDetailSprintId(s.id)}
                                onEdit={setEditSprint}
                                onStatus={setStatusSprint}
                                onDelete={setDeleteSprint}
                              />
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Dialogs */}
      <SprintDetailDialog
        open={!!detailSprintId}
        onOpenChange={(open) => {
          if (!open) setDetailSprintId(null);
        }}
        sprintId={detailSprintId}
        onEdit={(id) => {
          const s = rows.find((r) => r.id === id);
          if (s) setEditSprint(s);
        }}
        onDelete={(id) => {
          const s = rows.find((r) => r.id === id);
          if (s) setDeleteSprint(s);
        }}
        onStatus={(id) => {
          const s = rows.find((r) => r.id === id);
          if (s) setStatusSprint(s);
        }}
      />

      <SprintFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => {}}
        lockedProjectId={projectId}
      />

      {editSprint && (
        <SprintFormDialog
          open={!!editSprint}
          onOpenChange={(open) => {
            if (!open) setEditSprint(null);
          }}
          sprint={editSprint}
          onSuccess={() => {}}
          lockedProjectId={projectId}
        />
      )}

      {statusSprint && (
        <SprintStatusDialog
          open={!!statusSprint}
          onOpenChange={(open) => {
            if (!open) setStatusSprint(null);
          }}
          sprintId={statusSprint.id}
          sprintName={statusSprint.name}
          currentStatus={statusSprint.status}
          onSuccess={() => {}}
        />
      )}

      <ConfirmDialog
        open={!!deleteSprint_}
        onOpenChange={(open) => {
          if (!open) setDeleteSprint(null);
        }}
        title="Delete sprint"
        description={`Are you sure you want to delete "${deleteSprint_?.name ?? ""}"? Tickets in this sprint will be unassigned but not deleted.`}
        confirmLabel="Delete sprint"
        onConfirm={async () => {
          if (deleteSprint_) deleteMutation.mutate(deleteSprint_.id);
        }}
      />

      <SprintCSVImport
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={() => {}}
        projectId={projectId}
      />
    </div>
  );
}
