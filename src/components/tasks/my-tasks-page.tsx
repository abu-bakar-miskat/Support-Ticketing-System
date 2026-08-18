"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePersistedView, VIEW_KEYS } from "@/hooks/use-persisted-view";
import Link from "next/link";
import { useDrag, useDrop } from "react-dnd";
import { BoardDndProvider } from "@/components/board/board-dnd-provider";
import {
  AlignJustify,
  LayoutGrid,
  CheckSquare,
  Clock,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  GitPullRequest,
  Eye,
  Play,
  Pause,
  ListTodo,
} from "lucide-react";
import { avatarColorFor } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  normalizeStatus,
  formatLoggedTime,
  type BoardCardData,
  type SubCardData,
  type SubDepartmentStatusConfig,
  UI_STATUS_DOT,
  UI_PRIORITY_DOT_HEX,
} from "@/components/board/board-types";
import { PriorityPill } from "@/components/board/priority-indicator";
import { StatusPill } from "@/components/board/status-pill";
import { NewTicketModal } from "@/components/tickets/new-ticket-modal";
import { DrawerLink } from "@/components/tickets/drawer-link";
import { FilterDropdown, SortDropdown, type SortKey } from "@/components/tasks/task-filter-dropdown";
import { collectModules } from "@/components/board/board-filters";
import { TagPill } from "@/components/board/tag-pill";

function truncateTitle(title: string, maxWords = 6): string {
  const words = title.trim().split(/\s+/);
  if (words.length <= maxWords) return title;
  return words.slice(0, maxWords).join(" ") + "…";
}
import { sortCards } from "@/lib/sort-cards";
import { useSubDepartmentMembers } from "@/hooks/queries/use-board"
import { useSubDepartmentStatuses } from "@/hooks/queries/use-sub-department-statuses"
import { useCardState } from "@/hooks/use-card-state"
import { useLiveTimer } from "@/hooks/use-live-timer";
import { useTimerActions } from "@/hooks/use-timer-actions";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTasksMeta } from "@/hooks/queries/use-tasks";
import { useTimerStore } from "@/store";
import { moveTicket, updateTicket } from "@/lib/api/tickets";
import { InlineStatusPicker, InlineAssigneePicker } from "@/components/ui/inline-pickers";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateTaskCaches } from "@/hooks/queries/invalidate-task-caches";
import { useLinkedLabelMovePrompt } from "@/hooks/use-linked-label-move-prompt";
import { ProjectAvatar, ProjectDot } from "@/components/projects/project-avatar";
import type { AssignedSubtask } from "@/lib/board-data";
import { TaskTimeCell } from "@/components/tasks/task-time-cell";
import { CardModuleSegment, ModuleCell } from "@/components/board/module-label";
import {
  LIST_TD,
  ListCreatedCell,
  ListDueCell,
  MY_TASKS_COLGROUP,
  MY_TASKS_TABLE_CLASS,
  REVIEW_TASKS_TABLE_CLASS,
  TaskListHeadRow,
  ReviewTaskHeadRow,
  TaskListLabels,
  AssigneeAvatars,
  COL_ASSIGNEE,
  COL_CREATED,
  COL_CREATOR,
  COL_MODULE,
  COL_PROJECT,
  COL_STATUS,
  COL_TIME,
  TITLE_CELL_CLASS,
  TITLE_INNER_CLASS,
} from "@/components/tasks/task-list-cells";

const DRAG_TYPE = "MY_TASK_CARD";
type DragItem = { dbId: string; fromStatus: string };

/**
 * Resolve a ticket's stored status to the best matching team status label.
 * Exact match wins; falls back to whichever team status shares the same
 * canonical form (e.g. "Not Started" → "To Do" if "To Do" normalises to "Not Started").
 * Pass isComplete=true when the ticket's team has marked its status as complete —
 * this prevents completed tickets from falling through to "Not Started" when the
 * status label isn't present in the current teamStatuses list.
 */
function resolveToSubDepartmentStatus(cardStatus: string, subDepartmentStatuses: SubDepartmentStatusConfig[], isComplete?: boolean): string {
  if (subDepartmentStatuses.some((s) => s.label === cardStatus)) return cardStatus;
  const normalized = normalizeStatus(cardStatus);
  if (isComplete && normalized === "To Do") return cardStatus;
  const matched = subDepartmentStatuses.find((s) => normalizeStatus(s.label) === normalized);
  if (matched) return matched.label;
  return cardStatus;
}

// ── Sub-components ────────────────────────────────────────────────────────────


/** Small pill marking a ticket that is in the user's list because they are QA. */
function QaBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full bg-[#0d948815] px-1.5 py-px font-sans text-[9.5px] font-semibold uppercase tracking-wide text-[#0d9488]",
        className,
      )}
      title="You are assigned to QA this ticket"
    >
      QA
    </span>
  );
}

function PersonCell({ name, avatarUrl, subDepartment }: { name: string; avatarUrl?: string | null; subDepartment?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <UserAvatar name={name} avatarUrl={avatarUrl} size={18} meta={{ subDepartment }} />
      <span className="truncate whitespace-nowrap font-sans text-[11.5px] text-pen-foreground" title={name}>{name.length > 10 ? name.slice(0, 10) + "…" : name}</span>
    </div>
  );
}

function DraggableBoardCard({ task }: { task: BoardCardData }) {
  const { subTicketCards, expanded, creatingSubTicket, subTotal, subDone, subtasksDone, openSubTicketModal, closeSubTicketModal, toggleExpanded, onSubTicketCreated } = useCardState(task.subTicketCards);
  const { data: subDepartmentMembers = [] } = useSubDepartmentMembers(task.subDepartmentId);
  const { data: statuses = [] } = useSubDepartmentStatuses(task.subDepartmentId);
  const [startingTimer, setStartingTimer] = useState(false);
  const [stoppingTimer, setStoppingTimer] = useState(false);
  const timerEntryId = useTimerStore((s) => s.entryId);
  const timerTicketDbId = useTimerStore((s) => s.ticketDbId);
  const timerStartedAtMs = useTimerStore((s) => s.startedAtMs);
  const timerKind = useTimerStore((s) => s.kind);
  const { startTimer, stopTimer } = useTimerActions();
  const currentUser = useCurrentUser();
  const userId = currentUser?.id;
  const isRunning = timerTicketDbId === task.dbId && timerKind !== "QA";
  const elapsedSecs = useLiveTimer(isRunning ? timerStartedAtMs : null);
  const displaySecs = task.userLoggedSecs + (isRunning ? elapsedSecs : 0);
  const canTrack =
    normalizeStatus(task.status) === "In Progress" &&
    !!userId &&
    (task.assigneeId === userId || task.coAssignees.some((a) => a.id === userId));

  async function handleStartTimer(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (startingTimer || isRunning) return;
    setStartingTimer(true);
    try {
      await startTimer({ ticketDbId: task.dbId, humanId: task.humanId, title: task.title });
      toast.success(`Timer started on ${task.humanId}`);
    } catch {
      toast.error("Failed to start timer");
    } finally {
      setStartingTimer(false);
    }
  }

  async function handleStopTimer(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (stoppingTimer) return;
    setStoppingTimer(true);
    try {
      await stopTimer(timerEntryId);
      toast.success(`Timer paused on ${task.humanId}`);
    } catch {
      toast.error("Failed to pause timer");
    } finally {
      setStoppingTimer(false);
    }
  }

  const [{ isDragging }, dragRef] = useDrag<DragItem, void, { isDragging: boolean }>({
    type: DRAG_TYPE,
    item: { dbId: task.dbId, fromStatus: task.status },
    collect: (m) => ({ isDragging: m.isDragging() }),
  });

  return (
    <div
      ref={dragRef as unknown as React.Ref<HTMLDivElement>}
      className={cn(
        "group/card board-card cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40",
        isRunning && "ring-2 ring-pen-green/45 border-pen-green/50",
      )}
    >
      <DrawerLink
        ticketId={task.dbId}
        href={`/tickets/${task.dbId}`}
        card={task}
        className="flex w-full flex-col gap-2 px-3 py-[10px]"
      >
        {/* ID + priority */}
        <div className="flex h-4 items-center">
          <span className="font-mono text-[11.5px] font-semibold text-pen-foreground">{task.humanId}</span>
          {!!userId && task.qaAssignees.some((a) => a.id === userId) && <QaBadge className="ml-1.5" />}
          {isRunning && (
            <span className="ml-1.5 flex items-center gap-1 rounded-full bg-pen-green/10 px-1.5 py-px font-sans text-[9.5px] font-semibold text-pen-green">
              <span className="block size-1.5 animate-pulse rounded-full bg-pen-green" />
              Tracking
            </span>
          )}
          <span className="flex-1" />
          <PriorityPill priority={task.priority} status={task.status} />
        </div>

        {/* Title */}
        <p className="font-sans text-[12.5px] font-semibold leading-[18px] text-pen-foreground">{task.title}</p>

        {/* Creator */}
        {task.creatorName && (
          <div className="flex items-center gap-1">
            <span
              className="flex size-[14px] shrink-0 items-center justify-center rounded-full font-sans text-[11.5px] font-bold text-white"
              style={{ backgroundColor: avatarColorFor(task.creatorName) }}
            >
              {task.creatorName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()}
            </span>
            <span className="font-sans text-[11.5px] text-pen-subtle">{task.creatorName}</span>
          </div>
        )}

        {/* Project + module + comments + assignees */}
        <div className="flex h-5 items-center gap-1.5">
          {task.project && (
            <>
              <ProjectDot color={task.projectColor ?? "#0a76b9"} avatarUrl={task.projectAvatarUrl} name={task.project} size={16} />
              <span className="font-sans text-[11.5px] text-pen-subtle truncate max-w-[80px]">{task.project}</span>
            </>
          )}
          <CardModuleSegment
            moduleName={task.moduleName}
            withSeparator={!!task.project}
          />
          <span className="flex-1" />
          {task.comments > 0 && (
            <>
              <MessageCircle className="size-[11px] shrink-0 text-pen-subtle" />
              <span className="font-sans text-[11.5px] text-pen-subtle">{task.comments}</span>
            </>
          )}
          <span className="w-1" />
          <div className="flex items-center -space-x-1">
            {task.assigneeName ? (
              <UserAvatar name={task.assigneeName} avatarUrl={task.assigneeAvatarUrl} userId={task.assigneeId} size={18} className="ring-1 ring-pen-card" meta={{}} />
            ) : (
              <span className="block size-[18px] shrink-0 rounded-full border border-dashed border-pen-subtle" />
            )}
            {(task.coAssignees ?? []).slice(0, 2).map((a) => (
              <UserAvatar key={a.id} name={a.name} avatarUrl={a.avatarUrl} userId={a.id} size={18} className="ring-1 ring-pen-card" meta={{}} />
            ))}
            {(task.coAssignees ?? []).length > 2 && (
              <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-pen-surface font-sans text-[11.5px] text-pen-subtle ring-1 ring-pen-card">+{task.coAssignees.length - 2}</span>
            )}
          </div>
          {(task.qaAssignees?.length ?? 0) > 0 && (
            <div
              className="ml-1 flex items-center gap-0.5 border-l border-pen-card-border pl-1.5"
              title={`QA: ${task.qaAssignees.map((a) => a.name).join(", ")}`}
            >
              <span className="font-sans text-[9px] font-semibold uppercase tracking-wide text-[#0d9488]">
                QA
              </span>
              <div className="flex items-center -space-x-1">
                {task.qaAssignees.slice(0, 2).map((a) => (
                  <UserAvatar key={a.id} name={a.name} avatarUrl={a.avatarUrl} userId={a.id} size={18} className="ring-1 ring-[#0d9488]/40" meta={{}} />
                ))}
                {task.qaAssignees.length > 2 && (
                  <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-[#0d948815] font-sans text-[11.5px] text-[#0d9488] ring-1 ring-[#0d9488]/40">
                    +{task.qaAssignees.length - 2}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {task.labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {task.labels.slice(0, 3).map((lbl) => (
              <TagPill key={lbl} label={lbl} size="sm" />
            ))}
            {task.labels.length > 3 && (
              <span className="font-sans text-[10px] text-pen-subtle">+{task.labels.length - 3}</span>
            )}
          </div>
        )}

        <div className="h-px bg-[#f0f4f8] dark:bg-pen-card-border" />

        {/* Date */}
        <div className="flex h-4 items-center gap-[5px]">
          <Clock className="size-3 shrink-0 text-pen-muted" />
          {task.startDate && (
            <>
              <span className="font-mono text-[11.5px] font-medium text-pen-muted">{task.startDate}</span>
              <span className="font-mono text-[11.5px] text-pen-subtle">→</span>
            </>
          )}
          <span className={cn(
            "font-mono text-[11.5px] font-medium",
            task.due === "Complete" ? "text-pen-green"
              : task.dueOverdue ? "text-pen-red"
              : task.dueUrgent ? "text-amber-500"
              : task.due ? "text-pen-muted"
              : "text-pen-subtle",
          )}>
            {task.due ?? (task.startDate ? null : "—")}
          </span>
        </div>
      </DrawerLink>

      {/* Footer: time + sub-tickets */}
      <div className="flex flex-wrap items-center gap-1 px-3 pb-2">
        <div className="flex items-center gap-1">
          {isRunning ? (
            <span className="block size-[7px] shrink-0 animate-pulse rounded-full bg-pen-green" />
          ) : (
            <Clock className="size-[10px] shrink-0 text-pen-subtle" />
          )}
          <span className={cn("font-mono text-[11.5px]", isRunning ? "font-semibold text-pen-green" : "text-pen-subtle")}>
            {formatLoggedTime(displaySecs) ?? "—"}
          </span>
        </div>
        {isRunning ? (
          <button
            type="button"
            title="Pause timer"
            onClick={handleStopTimer}
            disabled={stoppingTimer}
            className="flex size-[18px] shrink-0 items-center justify-center rounded text-pen-red transition-colors hover:bg-pen-red/10 disabled:cursor-wait"
          >
            <Pause className="size-[9px] fill-current" />
          </button>
        ) : canTrack ? (
          <button
            type="button"
            title="Start timer"
            onClick={handleStartTimer}
            disabled={startingTimer}
            className="flex size-[18px] shrink-0 items-center justify-center rounded text-pen-subtle transition-opacity hover:bg-pen-surface hover:text-pen-blue disabled:cursor-wait"
          >
            <Play className="size-[10px]" />
          </button>
        ) : null}
        <span className="flex-1" />
        {subTotal > 0 && (
          <button
            type="button"
            onClick={toggleExpanded}
            className={cn(
              "flex items-center gap-1 rounded px-1 py-0.5 font-sans text-[11.5px] font-medium transition-colors hover:bg-pen-surface",
              subtasksDone ? "text-pen-green" : "text-pen-muted",
            )}
          >
            <ChevronRight className={cn("size-[11px] shrink-0 transition-transform", expanded && "rotate-90")} />
            {subDone}/{subTotal} sub-tickets
          </button>
        )}
        <button
          type="button"
          title="Add sub-task"
          onClick={openSubTicketModal}
          className="flex items-center gap-1 rounded px-1 py-0.5 font-sans text-[11.5px] text-pen-subtle transition-colors hover:bg-pen-surface hover:text-pen-blue"
        >
          <Plus className="size-[11px] shrink-0" />
          <span>Sub-task</span>
        </button>
      </div>
      {subTotal > 0 && expanded && (
        <div className="mx-3 mb-2 border-t border-pen-card-border pt-1">
          {subTicketCards.map((sub) => {
            const statusColor = UI_STATUS_DOT[normalizeStatus(sub.status)] ?? "#94a3b8";
            return (
              <DrawerLink key={sub.dbId} ticketId={sub.dbId} href={`/tickets/${sub.dbId}`} className="flex h-[26px] items-center gap-2 rounded px-1.5 hover:bg-pen-surface">
                <span className="block size-[6px] shrink-0 rounded-full" style={{ backgroundColor: statusColor }} />
                <span className="font-mono text-[9.5px] font-semibold text-pen-id shrink-0">{sub.humanId}</span>
                <span className="min-w-0 flex-1 truncate font-sans text-[11.5px] text-pen-foreground">{sub.title}</span>
              </DrawerLink>
            );
          })}
        </div>
      )}

      {creatingSubTicket && (
        <NewTicketModal
          projects={[{ id: task.projectId, name: task.project }]}
          subDepartmentMembers={subDepartmentMembers}
          subDepartmentMembersForCreate={subDepartmentMembers}
          defaultProjectId={task.projectId}
          defaultProjectName={task.project}
          defaultSubDepartmentId={task.subDepartmentId}
          statuses={statuses}
          parentId={task.dbId}
          parentHumanId={task.humanId}
          onCreated={onSubTicketCreated}
          onClose={closeSubTicketModal}
        />
      )}
    </div>
  );
}

// Review/PR row — shown in the manager's team review section
function ReviewTaskRow({ task, colorMap }: { task: BoardCardData; colorMap: Record<string, string> }) {
  const isPR = task.status.toLowerCase().includes("pull request") || task.status.toLowerCase() === "pr";

  const [liveStatus, setLiveStatus] = useState(task.status);
  useEffect(() => { setLiveStatus(task.status); }, [task.status]);

  const { data: statuses = [] } = useSubDepartmentStatuses(task.subDepartmentId);
  const queryClient = useQueryClient();

  async function handleStatusChange(newStatus: string, chosenLabel?: string) {
    const prev = liveStatus;
    setLiveStatus(newStatus);
    try {
      await moveTicket(task.dbId, { status: newStatus, chosenLabel });
      invalidateTaskCaches(queryClient);
    } catch {
      setLiveStatus(prev);
      toast.error("Failed to update status");
    }
  }

  const dotColor = colorMap[liveStatus] ?? (isPR ? "#7c3aed" : "#0a76b9");
  const priorityColor = UI_PRIORITY_DOT_HEX[task.priority] ?? "#94a3b8";
  const pulseCritical = task.priority === "critical" || task.priority === "urgent";

  return (
    <tr className="group border-b border-[#f0f4f8] transition-colors hover:bg-pen-blue/[0.03] dark:border-[#3a3a37] dark:hover:bg-pen-blue/[0.06]">
      <td className={cn("w-[72px] pl-4", LIST_TD)}>
        <DrawerLink ticketId={task.dbId} href={`/tickets/${task.dbId}`} card={task} className="font-mono text-[11.5px] font-semibold text-pen-id hover:underline">{task.humanId}</DrawerLink>
      </td>
      <td className={cn(TITLE_CELL_CLASS, LIST_TD)}>
        <div className={TITLE_INNER_CLASS}>
          {isPR
            ? <GitPullRequest className="size-[13px] shrink-0 text-purple-500" strokeWidth={2} />
            : <Eye className="size-[13px] shrink-0 text-pen-blue" strokeWidth={2} />
          }
          <DrawerLink ticketId={task.dbId} href={`/tickets/${task.dbId}`} card={task} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className={cn("block size-[7px] shrink-0 rounded-full", pulseCritical && "pen-critical-breathe")} style={{ backgroundColor: priorityColor }} />
            <span className="min-w-0 truncate font-sans text-[13px] text-pen-foreground group-hover:text-pen-blue" title={task.title}>{task.title}</span>
            <TaskListLabels labels={task.labels} />
          </DrawerLink>
        </div>
      </td>
      <td className={cn("hidden overflow-hidden sm:table-cell", LIST_TD)}>
        {task.project ? (
          <div className="flex min-w-0 items-center gap-2" title={task.project}>
            <ProjectAvatar
              color={task.projectColor ?? "#0a76b9"}
              avatarUrl={task.projectAvatarUrl}
              name={task.project}
              size={20}
            />
            <span className="min-w-0 truncate font-sans text-[11.5px] text-pen-muted">{task.project}</span>
          </div>
        ) : (
          <span className="font-sans text-[11.5px] text-pen-subtle">—</span>
        )}
      </td>
      <td className={cn(COL_STATUS, "overflow-hidden", LIST_TD)}>
        <InlineStatusPicker subDepartmentId={task.subDepartmentId} statuses={statuses} current={liveStatus} onSelect={handleStatusChange}>
          {({ ref, onClick }) => (
            <button ref={ref} type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} className="rounded transition-opacity hover:opacity-80">
              <StatusPill status={liveStatus} color={dotColor} size="sm" />
            </button>
          )}
        </InlineStatusPicker>
      </td>
      <td className={cn(COL_ASSIGNEE, "overflow-hidden", LIST_TD)}>
        <AssigneeAvatars
          assigneeId={task.assigneeId}
          assigneeName={task.assigneeName}
          assigneeAvatarUrl={task.assigneeAvatarUrl}
          coAssignees={task.coAssignees}
        />
      </td>
      <td className={cn("pr-4", LIST_TD)}>
        <ListDueCell
          due={task.due}
          dueOverdue={task.dueOverdue}
          dueUrgent={task.dueUrgent}
          status={liveStatus}
        />
      </td>
    </tr>
  );
}

function TaskListRow({ task, colorMap }: { task: BoardCardData; colorMap: Record<string, string> }) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = task.subTicketCards.length > 0;

  const [liveStatus, setLiveStatus] = useState(task.status);
  const [liveAssigneeId, setLiveAssigneeId] = useState(task.assigneeId ?? null);
  const [liveAssigneeName, setLiveAssigneeName] = useState(task.assigneeName ?? null);
  const [liveAssigneeAvatarUrl, setLiveAssigneeAvatarUrl] = useState(task.assigneeAvatarUrl ?? null);

  // Sync local display state when the server data changes (realtime / invalidation refetch)
  useEffect(() => { setLiveStatus(task.status); }, [task.status]);
  useEffect(() => {
    setLiveAssigneeId(task.assigneeId ?? null);
    setLiveAssigneeName(task.assigneeName ?? null);
    setLiveAssigneeAvatarUrl(task.assigneeAvatarUrl ?? null);
  }, [task.assigneeId, task.assigneeName, task.assigneeAvatarUrl]);

  const { data: statuses = [] } = useSubDepartmentStatuses(task.subDepartmentId);
  const { data: members = [] } = useSubDepartmentMembers(task.subDepartmentId);
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();
  const isQaForMe = !!currentUser?.id && task.qaAssignees.some((a) => a.id === currentUser.id);

  async function handleStatusChange(newStatus: string, chosenLabel?: string) {
    const prev = liveStatus;
    setLiveStatus(newStatus);
    try {
      await moveTicket(task.dbId, { status: newStatus, chosenLabel });
      invalidateTaskCaches(queryClient);
    } catch {
      setLiveStatus(prev);
      toast.error("Failed to update status");
    }
  }

  async function handleAssigneeChange(member: { id: string; name: string; avatarUrl?: string | null } | null) {
    const [pId, pName, pUrl] = [liveAssigneeId, liveAssigneeName, liveAssigneeAvatarUrl];
    setLiveAssigneeId(member?.id ?? null);
    setLiveAssigneeName(member?.name ?? null);
    setLiveAssigneeAvatarUrl(member?.avatarUrl ?? null);
    try {
      await updateTicket(task.dbId, { assigneeId: member?.id ?? null });
      invalidateTaskCaches(queryClient);
    } catch {
      setLiveAssigneeId(pId);
      setLiveAssigneeName(pName);
      setLiveAssigneeAvatarUrl(pUrl);
      toast.error("Failed to update assignee");
    }
  }

  const priorityColor = UI_PRIORITY_DOT_HEX[task.priority] ?? "#94a3b8";
  const pulseCritical = task.priority === "critical" || task.priority === "urgent";

  return (
    <>
      <tr className="group border-b border-[#f0f4f8] transition-colors hover:bg-pen-bg dark:border-[#3a3a37]">
        <td className={cn("w-[72px] pl-4", LIST_TD)}>
          <DrawerLink ticketId={task.dbId} href={`/tickets/${task.dbId}`} card={task} className="font-mono text-[11.5px] font-semibold text-pen-id hover:underline">{task.humanId}</DrawerLink>
        </td>
        <td className={cn(TITLE_CELL_CLASS, LIST_TD)}>
          <div className={TITLE_INNER_CLASS}>
            {hasChildren && (
              <button type="button" onClick={() => setExpanded((v) => !v)} className="flex shrink-0 items-center justify-center text-pen-muted hover:text-pen-foreground">
                <ChevronRight className={cn("size-[13px] transition-transform", expanded && "rotate-90")} />
              </button>
            )}
            <DrawerLink ticketId={task.dbId} href={`/tickets/${task.dbId}`} card={task} className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className={cn("block size-[7px] shrink-0 rounded-full", pulseCritical && "pen-critical-breathe")} style={{ backgroundColor: priorityColor }} />
              <span className="min-w-0 truncate font-sans text-[13px] text-pen-foreground group-hover:text-pen-id" title={task.title}>{truncateTitle(task.title)}</span>
              {isQaForMe && <QaBadge />}
              <TaskListLabels labels={task.labels} />
              {hasChildren && (
                <span className="shrink-0 rounded-full bg-pen-surface px-1.5 py-px font-sans text-[11.5px] text-pen-subtle">{task.subTicketCards.length}</span>
              )}
            </DrawerLink>
          </div>
        </td>
        <td className={cn(COL_STATUS, "overflow-hidden", LIST_TD)}>
          <InlineStatusPicker subDepartmentId={task.subDepartmentId} statuses={statuses} current={liveStatus} onSelect={handleStatusChange}>
            {({ ref, onClick }) => (
              <button ref={ref} type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} className="rounded transition-opacity hover:opacity-80">
                <StatusPill status={liveStatus} color={colorMap[liveStatus] ?? "#94a3b8"} size="sm" />
              </button>
            )}
          </InlineStatusPicker>
        </td>
        <td className={cn(COL_CREATOR, "overflow-hidden", LIST_TD)}>
          {task.creatorName ? <PersonCell name={task.creatorName} avatarUrl={task.creatorAvatarUrl} /> : <span className="font-sans text-[11.5px] text-pen-subtle">—</span>}
        </td>
        <td className={cn(COL_ASSIGNEE, "overflow-hidden", LIST_TD)}>
          <InlineAssigneePicker members={members} currentId={liveAssigneeId} onSelect={handleAssigneeChange}>
            {({ ref, onClick }) => (
              <button ref={ref} type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} className="rounded px-1 py-0.5 transition-colors hover:bg-pen-surface">
                <AssigneeAvatars
                  assigneeId={liveAssigneeId}
                  assigneeName={liveAssigneeName}
                  assigneeAvatarUrl={liveAssigneeAvatarUrl}
                  coAssignees={task.coAssignees}
                />
              </button>
            )}
          </InlineAssigneePicker>
        </td>
        <td className={cn(COL_PROJECT, "overflow-hidden", LIST_TD)}>
          <div className="flex min-w-0 items-center gap-2" title={task.project}>
            <ProjectAvatar
              color={task.projectColor ?? "#0a76b9"}
              avatarUrl={task.projectAvatarUrl}
              name={task.project}
              size={22}
            />
            <span className="min-w-0 truncate whitespace-nowrap font-sans text-[11.5px] text-pen-muted">{task.project}</span>
          </div>
        </td>
        <td className={cn(COL_MODULE, "overflow-hidden", LIST_TD)}>
          <ModuleCell moduleName={task.moduleName} />
        </td>
        <td className={cn(COL_TIME, "overflow-hidden", LIST_TD)}>
          <TaskTimeCell
            ticketDbId={task.dbId}
            humanId={task.humanId}
            title={task.title}
            status={liveStatus}
            assigneeId={liveAssigneeId}
            coAssigneeIds={task.coAssignees.map((a) => a.id)}
            userLoggedSecs={task.userLoggedSecs}
            estimatedTime={task.estimatedTime}
          />
        </td>
        <td className={cn(COL_CREATED, "overflow-hidden", LIST_TD)}>
          <ListCreatedCell iso={task.createdIso} />
        </td>
        <td className={cn("pr-4", LIST_TD)}>
          <ListDueCell
            due={task.due}
            dueOverdue={task.dueOverdue}
            dueUrgent={task.dueUrgent}
            status={liveStatus}
          />
        </td>
      </tr>
      {expanded && hasChildren && task.subTicketCards.map((sub) => {
        const subPriorityColor = UI_PRIORITY_DOT_HEX[sub.priority] ?? "#94a3b8";
        const subPulseCritical = sub.priority === "critical" || sub.priority === "urgent";
        return (
          <tr key={sub.dbId} className="border-b border-[#f0f4f8] bg-pen-bg transition-colors hover:bg-pen-surface dark:border-[#3a3a37]">
            <td className="w-[80px] py-2 pl-4">
              <DrawerLink ticketId={sub.dbId} href={`/tickets/${sub.dbId}`} className="font-mono text-[11.5px] font-semibold text-pen-id hover:underline">{sub.humanId}</DrawerLink>
            </td>
            <td className="max-w-0 py-2 pr-3 pl-5">
              <DrawerLink ticketId={sub.dbId} href={`/tickets/${sub.dbId}`} className="flex min-w-0 items-center gap-2">
                <span className={cn("block size-[6px] shrink-0 rounded-full", subPulseCritical && "pen-critical-breathe")} style={{ backgroundColor: subPriorityColor }} />
                <span className="truncate font-sans text-[12px] text-pen-foreground">{sub.title}</span>
              </DrawerLink>
            </td>
            <td className={cn(COL_STATUS, "py-2")}>
              <span className="font-sans text-[11.5px] text-pen-muted">{sub.status}</span>
            </td>
            <td className={cn(COL_CREATOR, "py-2")} />
            <td className={cn(COL_ASSIGNEE, "py-2")}>
              {sub.assigneeName ? (
                <UserAvatar name={sub.assigneeName} avatarUrl={sub.assigneeAvatarUrl} userId={sub.assigneeId} size={20} meta={{}} />
              ) : (
                <span className="block size-5 shrink-0 rounded-full border border-dashed border-pen-subtle" title="Unassigned" />
              )}
            </td>
            <td className={cn(COL_PROJECT, "py-2")} />
            <td className={cn(COL_MODULE, "py-2")} />
            <td className={cn(COL_TIME, "py-2")} />
            <td className={cn(COL_CREATED, "py-2")} />
            <td className="py-2 pr-4" />
          </tr>
        );
      })}
    </>
  );
}

function SubtaskListRow({ task, colorMap }: { task: AssignedSubtask; colorMap: Record<string, string> }) {
  const [liveStatus, setLiveStatus] = useState(task.status);
  useEffect(() => { setLiveStatus(task.status); }, [task.status]);
  const { data: statuses = [] } = useSubDepartmentStatuses(task.subDepartmentId);
  const statusColor = colorMap[liveStatus] ?? colorMap[task.status] ?? "#94a3b8";
  const queryClient = useQueryClient();

  async function handleStatusChange(newStatus: string, chosenLabel?: string) {
    const prev = liveStatus;
    setLiveStatus(newStatus);
    try {
      await moveTicket(task.dbId, { status: newStatus, chosenLabel });
      invalidateTaskCaches(queryClient);
    } catch {
      setLiveStatus(prev);
      toast.error("Failed to update status");
    }
  }

  const priorityColor = UI_PRIORITY_DOT_HEX[task.priority] ?? "#94a3b8";
  const pulseCritical = task.priority === "critical" || task.priority === "urgent";

  return (
    <tr className="group border-b border-[#f0f4f8] bg-pen-bg/40 transition-colors hover:bg-pen-bg dark:border-[#3a3a37] dark:bg-pen-surface/20">
      <td className="w-[80px] py-2.5 pl-4">
        <DrawerLink ticketId={task.dbId} href={`/tickets/${task.dbId}`} card={task} className="font-mono text-[11.5px] font-semibold text-pen-id hover:underline">
          {task.humanId}
        </DrawerLink>
      </td>
      <td className={cn(TITLE_CELL_CLASS, "py-2.5")}>
        <DrawerLink ticketId={task.dbId} href={`/tickets/${task.dbId}`} card={task} className="flex min-w-0 items-center gap-2 overflow-hidden">
          <span className={cn("block size-[7px] shrink-0 rounded-full", pulseCritical && "pen-critical-breathe")} style={{ backgroundColor: priorityColor }} />
          <span className="shrink-0 rounded-full border border-pen-card-border bg-pen-surface px-1.5 py-px font-sans text-[10px] font-semibold text-pen-subtle">
            ↳ sub
          </span>
          <span className="truncate font-sans text-[13px] text-pen-foreground group-hover:text-pen-id">{task.title}</span>
        </DrawerLink>
      </td>
      <td className={cn(COL_STATUS, "overflow-hidden", LIST_TD)}>
        <InlineStatusPicker subDepartmentId={task.subDepartmentId} statuses={statuses} current={liveStatus} onSelect={handleStatusChange}>
          {({ ref, onClick }) => (
            <button ref={ref} type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} className="rounded transition-opacity hover:opacity-80">
              <StatusPill status={liveStatus} color={statusColor} size="sm" />
            </button>
          )}
        </InlineStatusPicker>
      </td>
      <td className={cn(COL_CREATOR, "overflow-hidden py-2.5")}>
        <Link href={`/tickets/${task.parentDbId}`} className="font-mono text-[11.5px] font-semibold text-pen-id hover:underline">
          {task.parentHumanId}
        </Link>
      </td>
      <td className={cn(COL_ASSIGNEE, "overflow-hidden py-2.5")}>
        <AssigneeAvatars
          assigneeId={task.assigneeId}
          assigneeName={task.assigneeName}
          assigneeAvatarUrl={task.assigneeAvatarUrl}
          coAssignees={[]}
        />
      </td>
      <td className={cn(COL_PROJECT, "overflow-hidden py-2.5")}>
        <div className="flex min-w-0 items-center gap-2" title={task.project}>
          <ProjectAvatar
            color={task.projectColor ?? "#0a76b9"}
            avatarUrl={task.projectAvatarUrl}
            name={task.project}
            size={22}
          />
          <span className="min-w-0 truncate font-sans text-[11.5px] text-pen-muted max-w-[110px]">{task.project}</span>
        </div>
      </td>
      <td className={cn(COL_MODULE, "py-2.5")} />
      <td className={cn(COL_TIME, "py-2.5")} />
      <td className={cn(COL_CREATED, "py-2.5")} />
      <td className={cn("pr-4", LIST_TD)}>
        <ListDueCell
          due={task.due}
          dueOverdue={task.dueOverdue}
          dueUrgent={task.dueUrgent}
          status={liveStatus}
        />
      </td>
    </tr>
  );
}

function BoardColumn({
  status,
  cards,
  onDrop,
  onAdd,
}: {
  status: SubDepartmentStatusConfig;
  cards: BoardCardData[];
  onDrop: (dbId: string, toStatus: string) => void;
  onAdd: (statusLabel: string) => void;
}) {
  const [{ isOver, canDrop }, dropRef] = useDrop<DragItem, void, { isOver: boolean; canDrop: boolean }>({
    accept: DRAG_TYPE,
    drop: (item) => {
      if (item.fromStatus !== status.label) onDrop(item.dbId, status.label);
    },
    canDrop: (item) => item.fromStatus !== status.label,
    collect: (m) => ({ isOver: m.isOver(), canDrop: m.canDrop() }),
  });

  const isActive = isOver && canDrop;
  const badgeBg = `${status.color}1a`;

  return (
    <div
      ref={dropRef as unknown as React.Ref<HTMLDivElement>}
      className={cn(
        "flex h-full w-[280px] shrink-0 flex-col gap-2 rounded-[10px] bg-pen-surface p-3 transition-colors sm:w-[300px] lg:w-[min(320px,calc((100cqw-3.5rem)/5))]",
        isActive && "ring-2 ring-inset",
      )}
      style={isActive ? ({ "--tw-ring-color": status.color } as React.CSSProperties) : undefined}
    >
      <div className="flex h-6 shrink-0 items-center gap-2">
        <span className="block size-[7px] shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
        <span className="font-sans text-[12px] font-semibold text-pen-foreground">{status.label}</span>
        <span
          className="flex items-center justify-center rounded-full px-[7px] py-px font-sans text-[11.5px] font-medium"
          style={{ backgroundColor: badgeBg, color: status.color }}
        >
          {cards.length}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => onAdd(status.label)}
          className="flex size-[18px] items-center justify-center rounded text-pen-subtle transition-colors hover:bg-pen-card hover:text-pen-foreground"
          aria-label={`Add task to ${status.label}`}
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {cards.map((task) => (
          <DraggableBoardCard key={task.dbId} task={task} />
        ))}
        {cards.length === 0 && (
          <p className={cn("py-2 text-center font-sans text-[11.5px] transition-colors", isActive ? "text-pen-blue" : "text-pen-subtle")}>
            {isActive ? "Drop here" : "No tasks"}
          </p>
        )}
        <button
          type="button"
          onClick={() => onAdd(status.label)}
          className="flex w-full items-center gap-1.5 rounded-[7px] px-2 py-1.5 text-pen-subtle transition-colors hover:bg-pen-card-border/50 hover:text-pen-foreground"
        >
          <Plus className="size-3 shrink-0" />
          <span className="font-sans text-[11.5px]">Add task</span>
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  tasks: BoardCardData[];
  subDepartmentStatuses: SubDepartmentStatusConfig[];
  subDepartmentStatusMap?: Record<string, SubDepartmentStatusConfig[]>;
  reviewTasks?: BoardCardData[];
  isManager?: boolean;
  subtasks?: AssignedSubtask[];
  hideTitleBar?: boolean;
};

const PAGE_SIZE = 20;

type FlatRow =
  | { kind: "task"; data: BoardCardData }
  | { kind: "subtask"; data: AssignedSubtask };

export function MyTasksPage({ tasks: initialTasks, subDepartmentStatuses, subDepartmentStatusMap = {}, reviewTasks = [], isManager = false, subtasks = [], hideTitleBar = false }: Props) {
  const [localTasks, setLocalTasks] = useState<BoardCardData[]>(initialTasks);
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [view, setView] = usePersistedView(VIEW_KEYS.boardLayout, "list", ["board", "list"] as const);
  const [page, setPage] = useState(1);
  const [createForStatus, setCreateForStatus] = useState<string | null>(null);
  // Managers see a team review/PR list — kept collapsed by default and below
  // their own tasks so the view leads with what's assigned to them.
  const [reviewOpen, setReviewOpen] = useState(false);
  const { data: meta } = useTasksMeta();
  const queryClient = useQueryClient();
  const boardTimerTicketDbId = useTimerStore((s) => s.ticketDbId);
  const boardTimerEntryId = useTimerStore((s) => s.entryId);
  const { stopTimer: stopTimerOnMove } = useTimerActions();
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const dragScrollState = useRef({ dragging: false, startX: 0, scrollLeft: 0 });

  function handleBoardMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest(".board-card")) return;
    const el = boardScrollRef.current;
    if (!el) return;
    dragScrollState.current = { dragging: true, startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft };
    const onMove = (ev: MouseEvent) => {
      if (!dragScrollState.current.dragging) return;
      const x = ev.pageX - el.offsetLeft;
      el.scrollLeft = dragScrollState.current.scrollLeft - (x - dragScrollState.current.startX);
    };
    const onUp = () => {
      dragScrollState.current.dragging = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  useEffect(() => {
    setLocalTasks(initialTasks);
  }, [initialTasks]);

  const sortedStatuses = useMemo(() => {
    const allStatuses = Object.values(subDepartmentStatusMap).flat()
    if (allStatuses.length === 0) return [...subDepartmentStatuses].sort((a, b) => a.order - b.order)
    // Deduplicate by label — keep first occurrence
    const seen = new Set<string>()
    const merged: SubDepartmentStatusConfig[] = []
    for (const s of allStatuses) {
      if (!seen.has(s.label)) {
        seen.add(s.label)
        merged.push(s)
      }
    }
    return merged.sort((a, b) => a.order - b.order)
  }, [subDepartmentStatuses, subDepartmentStatusMap]);

  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    const allStatuses = [...Object.values(subDepartmentStatusMap).flat(), ...subDepartmentStatuses];
    for (const s of allStatuses) {
      map[s.label] = s.color;
      map[normalizeStatus(s.label)] = s.color;
    }
    return map;
  }, [subDepartmentStatuses, subDepartmentStatusMap]);

  // Team review/PR list grouped by assignee so a large queue stays scannable —
  // the manager can see whose work is waiting, busiest person first.
  const reviewGroups = useMemo(() => {
    const map = new Map<
      string,
      { name: string; avatarUrl: string | null; tasks: BoardCardData[] }
    >();
    for (const t of reviewTasks) {
      const key = t.assigneeId ?? "__unassigned__";
      const g = map.get(key) ?? {
        name: t.assigneeName ?? "Unassigned",
        avatarUrl: t.assigneeAvatarUrl ?? null,
        tasks: [],
      };
      g.tasks.push(t);
      map.set(key, g);
    }
    return [...map.values()].sort(
      (a, b) => b.tasks.length - a.tasks.length || a.name.localeCompare(b.name),
    );
  }, [reviewTasks]);

  // Single O(n) pass → Map; replaces O(n×m) repeated .filter() calls
  const countsByStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of localTasks) {
      const key = resolveToSubDepartmentStatus(t.status, subDepartmentStatusMap[t.subDepartmentId] ?? sortedStatuses, t.isComplete);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [localTasks, sortedStatuses, subDepartmentStatusMap]);

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: localTasks.length };
    for (const s of sortedStatuses) result[s.label] = countsByStatus.get(s.label) ?? 0;
    for (const [label, count] of countsByStatus) {
      if (result[label] === undefined) result[label] = count;
    }
    return result;
  }, [localTasks.length, sortedStatuses, countsByStatus]);

  const extraStatusLabels = useMemo(() => {
    const known = new Set(sortedStatuses.map((s) => s.label));
    const extras = new Set<string>();
    for (const t of localTasks) {
      const key = resolveToSubDepartmentStatus(t.status, subDepartmentStatusMap[t.subDepartmentId] ?? sortedStatuses, t.isComplete);
      if (!known.has(key)) extras.add(key);
    }
    return [...extras].sort((a, b) => a.localeCompare(b));
  }, [localTasks, sortedStatuses, subDepartmentStatusMap]);

  const [filterProject, setFilterProject] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<Set<string>>(new Set());
  const [filterPriority, setFilterPriority] = useState<Set<string>>(new Set());
  const [filterDue, setFilterDue] = useState<Set<string>>(new Set());
  const [filterLabels, setFilterLabels] = useState<Set<string>>(new Set());
  const [filterModule, setFilterModule] = useState<Set<string>>(new Set());

  const projectOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: string[] = [];
    for (const t of localTasks) {
      if (t.project && !seen.has(t.project)) { seen.add(t.project); opts.push(t.project); }
    }
    return opts.sort();
  }, [localTasks]);

  const moduleOptions = useMemo(
    () => collectModules(localTasks),
    [localTasks],
  );

  const labelOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const t of localTasks) {
      for (const lbl of t.labels) seen.add(lbl);
    }
    return [...seen].sort();
  }, [localTasks]);

  const statusFilterOptions = useMemo(() => {
    const opts = sortedStatuses.map((s) => ({
      id: s.label,
      label: `${s.label} (${counts[s.label] ?? 0})`,
      color: s.color,
    }));
    for (const label of extraStatusLabels) {
      opts.push({
        id: label,
        label: `${label} (${counts[label] ?? 0})`,
        color: "#64748b",
      });
    }
    return opts;
  }, [sortedStatuses, extraStatusLabels, counts]);

  // Stable date boundaries — recomputed once per mount, not on every render.
  // These were previously bare `new Date()` calls whose object identity changed
  // every render, defeating the filteredTasks useMemo entirely.
  const { today, endOfWeek, endOfMonth } = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const w = new Date(t);
    w.setDate(t.getDate() + (6 - t.getDay()));
    const m = new Date(t.getFullYear(), t.getMonth() + 1, 0);
    return { today: t, endOfWeek: w, endOfMonth: m };
  }, []);

  const filteredTasks = useMemo(() => {
    const filtered = localTasks.filter((t) => {
      if (filterStatus.size > 0) {
        const resolved = resolveToSubDepartmentStatus(
          t.status,
          subDepartmentStatusMap[t.subDepartmentId] ?? sortedStatuses,
          t.isComplete,
        );
        if (!filterStatus.has(resolved)) return false;
      }
      if (filterProject.size > 0 && !filterProject.has(t.project)) return false;
      if (filterPriority.size > 0 && !filterPriority.has(t.priority)) return false;
      if (filterDue.size > 0) {
        const due = t.due ? new Date(t.due) : null;
        const matches = [...filterDue].some((f) => {
          if (f === "overdue") return t.due === "Overdue";
          if (f === "today") return due && due <= today;
          if (f === "this_week") return due && due <= endOfWeek;
          if (f === "this_month") return due && due <= endOfMonth;
          if (f === "no_due") return !t.due;
          return true;
        });
        if (!matches) return false;
      }
      if (filterLabels.size > 0 && !t.labels.some((l) => filterLabels.has(l))) return false;
      if (filterModule.size > 0 && (!t.moduleId || !filterModule.has(t.moduleId))) return false;
      return true;
    });
    return sortCards(filtered, sortKey);
  }, [localTasks, filterStatus, sortedStatuses, subDepartmentStatusMap, filterProject, filterPriority, filterDue, filterLabels, filterModule, today, endOfWeek, endOfMonth, sortKey]);

  const activeExtraFilters =
    filterStatus.size +
    filterProject.size +
    filterPriority.size +
    filterDue.size +
    filterLabels.size +
    filterModule.size;

  // Flat unified list: tasks first, then standalone subtasks
  const allFlatRows = useMemo<FlatRow[]>(() => [
    ...filteredTasks.map((t) => ({ kind: "task" as const, data: t })),
    ...subtasks.map((s) => ({ kind: "subtask" as const, data: s })),
  ], [filteredTasks, subtasks]);

  const totalPages = Math.max(1, Math.ceil(allFlatRows.length / PAGE_SIZE));
  const pagedRows = useMemo(
    () => allFlatRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [allFlatRows, page],
  );

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [allFlatRows.length]);
  const totalSubtickets = useMemo(() => {
    const ids = new Set<string>();
    for (const s of subtasks) ids.add(s.dbId);
    for (const t of localTasks) {
      for (const sub of t.subTicketCards) ids.add(sub.dbId);
    }
    return ids.size;
  }, [subtasks, localTasks]);
  const filteredSubtickets = useMemo(() => {
    const ids = new Set<string>();
    for (const s of subtasks) ids.add(s.dbId);
    for (const t of filteredTasks) {
      for (const sub of t.subTicketCards) ids.add(sub.dbId);
    }
    return ids.size;
  }, [subtasks, filteredTasks]);

  // Pre-index filtered tasks by resolved status → O(1) board-column lookup
  const filteredByStatus = useMemo(() => {
    const map = new Map<string, BoardCardData[]>();
    for (const t of filteredTasks) {
      const key = resolveToSubDepartmentStatus(t.status, subDepartmentStatusMap[t.subDepartmentId] ?? sortedStatuses, t.isComplete);
      const arr = map.get(key);
      if (arr) arr.push(t);
      else map.set(key, [t]);
    }
    return map;
  }, [filteredTasks, sortedStatuses, subDepartmentStatusMap]);

  const resolveStatusesForCard = useCallback(
    (subDepartmentId: string) => subDepartmentStatusMap[subDepartmentId] ?? sortedStatuses,
    [subDepartmentStatusMap, sortedStatuses],
  );

  const doMove = useCallback((dbId: string, toStatus: string, chosenLabel?: string) => {
    if (boardTimerTicketDbId === dbId && normalizeStatus(toStatus) !== "In Progress") {
      stopTimerOnMove(boardTimerEntryId).catch(() => undefined);
    }
    setLocalTasks((prev) => {
      const snapshot = prev;
      moveTicket(dbId, { status: toStatus, chosenLabel })
        .then(() => invalidateTaskCaches(queryClient))
        .catch(() => setLocalTasks(snapshot));
      return prev.map((c) => (c.dbId === dbId ? { ...c, status: toStatus } : c));
    });
  }, [queryClient, boardTimerTicketDbId, boardTimerEntryId, stopTimerOnMove]);

  const getCardSubDepartmentId = useCallback(
    (dbId: string) => localTasks.find((c) => c.dbId === dbId)?.subDepartmentId,
    [localTasks],
  );

  const { tryMove: moveCard, modal: labelChoiceModal } = useLinkedLabelMovePrompt({
    resolveStatusesForCard,
    getCardSubDepartmentId,
    onMove: doMove,
  });

  return (
    <BoardDndProvider>
      <div className="flex h-full flex-col overflow-hidden">
      <div
        className={cn(
          "shrink-0 px-4 sm:px-6 xl:px-8",
          hideTitleBar ? "py-2" : "pt-3 sm:pt-4 xl:pt-5",
        )}
      >
        {!hideTitleBar && (
          <PageHeader title="My Tasks" icon={ListTodo} iconClassName="text-pen-blue" className="mb-3" />
        )}

        {/* Filters + view toggle */}
        <div
          className={cn(
            "flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between",
            hideTitleBar ? "mb-0" : "mb-3 sm:mb-4",
          )}
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] max-xl:-mx-4 max-xl:px-4 sm:max-xl:-mx-6 sm:max-xl:px-6 xl:overflow-visible xl:px-0 [&::-webkit-scrollbar]:hidden">
            <p className="shrink-0 font-sans text-[12px] text-pen-muted sm:text-[12.5px]">
              <span className="font-semibold text-pen-foreground">{filteredTasks.length}</span>
              {" of "}
              <span className="font-semibold text-pen-foreground">{localTasks.length}</span>
              {" task"}{localTasks.length === 1 ? "" : "s"}
              {totalSubtickets > 0 && (
                <>
                  {" + "}
                  <span className="font-semibold text-pen-foreground">{filteredSubtickets}</span>
                  {filteredSubtickets !== totalSubtickets && (
                    <>
                      {" of "}
                      <span className="font-semibold text-pen-foreground">{totalSubtickets}</span>
                    </>
                  )}
                  {" sub-ticket"}{filteredSubtickets === 1 ? "" : "s"}
                </>
              )}
            </p>

            {statusFilterOptions.length > 0 && (
              <FilterDropdown
                label="Status"
                options={statusFilterOptions}
                selected={filterStatus}
                onToggle={(id) =>
                  setFilterStatus((prev) => {
                    const n = new Set(prev);
                    n.has(id) ? n.delete(id) : n.add(id);
                    return n;
                  })
                }
                onClear={() => setFilterStatus(new Set())}
              />
            )}
            <FilterDropdown
              label="Project"
              options={projectOptions.map((p) => ({ id: p, label: p }))}
              selected={filterProject}
              onToggle={(id) =>
                setFilterProject((prev) => {
                  const n = new Set(prev);
                  n.has(id) ? n.delete(id) : n.add(id);
                  return n;
                })
              }
              onClear={() => setFilterProject(new Set())}
            />
            {moduleOptions.length > 0 && (
              <FilterDropdown
                label="Module"
                options={moduleOptions.map((m) => ({ id: m.id, label: m.name }))}
                selected={filterModule}
                onToggle={(id) =>
                  setFilterModule((prev) => {
                    const n = new Set(prev);
                    n.has(id) ? n.delete(id) : n.add(id);
                    return n;
                  })
                }
                onClear={() => setFilterModule(new Set())}
              />
            )}
            <FilterDropdown
              label="Priority"
              options={[
                { id: "urgent", label: "Urgent", color: "#ff4500" },
                { id: "critical", label: "Critical", color: "#dc2626" },
                { id: "high", label: "High", color: "#f97316" },
                { id: "medium", label: "Medium", color: "#ec4899" },
                { id: "low", label: "Low", color: "#94a3b8" },
              ]}
              selected={filterPriority}
              onToggle={(id) =>
                setFilterPriority((prev) => {
                  const n = new Set(prev);
                  n.has(id) ? n.delete(id) : n.add(id);
                  return n;
                })
              }
              onClear={() => setFilterPriority(new Set())}
            />
            <FilterDropdown
              label="Due date"
              options={[
                { id: "overdue", label: "Overdue" },
                { id: "today", label: "Due today" },
                { id: "this_week", label: "This week" },
                { id: "this_month", label: "This month" },
                { id: "no_due", label: "No due date" },
              ]}
              selected={filterDue}
              onToggle={(id) =>
                setFilterDue((prev) => {
                  const n = new Set(prev);
                  n.has(id) ? n.delete(id) : n.add(id);
                  return n;
                })
              }
              onClear={() => setFilterDue(new Set())}
            />
            <FilterDropdown
              label="Labels"
              options={labelOptions.map((l) => ({ id: l, label: l }))}
              selected={filterLabels}
              onToggle={(id) =>
                setFilterLabels((prev) => {
                  const n = new Set(prev);
                  n.has(id) ? n.delete(id) : n.add(id);
                  return n;
                })
              }
              onClear={() => setFilterLabels(new Set())}
            />
            {activeExtraFilters > 0 && (
              <button
                type="button"
                onClick={() => {
                  setFilterStatus(new Set());
                  setFilterProject(new Set());
                  setFilterModule(new Set());
                  setFilterPriority(new Set());
                  setFilterDue(new Set());
                  setFilterLabels(new Set());
                }}
                className="flex shrink-0 items-center gap-1 rounded-full border border-pen-card-border bg-pen-surface px-2.5 py-1 font-sans text-[11.5px] whitespace-nowrap text-pen-subtle hover:text-pen-foreground"
              >
                <X className="size-3" />
                Clear
              </button>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <SortDropdown value={sortKey} onChange={(v) => setSortKey(v as SortKey)} />

            {view === "board" && (
              <div className="flex h-7 shrink-0 overflow-hidden rounded-md border border-pen-card-border bg-pen-card">
                <button
                  type="button"
                  onClick={() => boardScrollRef.current?.scrollBy({ left: -320, behavior: "smooth" })}
                  className="flex h-[26px] w-7 items-center justify-center text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground"
                  aria-label="Scroll board left"
                >
                  <ChevronLeft className="size-3.5 shrink-0" />
                </button>
                <span className="w-px self-stretch bg-pen-card-border" />
                <button
                  type="button"
                  onClick={() => boardScrollRef.current?.scrollBy({ left: 320, behavior: "smooth" })}
                  className="flex h-[26px] w-7 items-center justify-center text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground"
                  aria-label="Scroll board right"
                >
                  <ChevronRight className="size-3.5 shrink-0" />
                </button>
              </div>
            )}

            <div className="flex h-7 shrink-0 overflow-hidden rounded-md border border-pen-card-border bg-pen-card">
              <button
                type="button"
                onClick={() => setView("list")}
                aria-label="List view"
                className={cn(
                  "flex h-[26px] items-center gap-1.5 px-2.5 font-sans text-[11.5px] font-medium transition-colors sm:px-3",
                  view === "list"
                    ? "rounded-md bg-pen-blue-tint font-semibold text-pen-id"
                    : "text-pen-muted hover:text-pen-foreground",
                )}
              >
                <AlignJustify className="size-3" />
                <span className="hidden sm:inline">List</span>
              </button>
              <button
                type="button"
                onClick={() => setView("board")}
                aria-label="Board view"
                className={cn(
                  "flex h-[26px] items-center gap-1.5 px-2.5 font-sans text-[11.5px] font-medium transition-colors sm:px-3",
                  view === "board"
                    ? "rounded-md bg-pen-blue-tint font-semibold text-pen-id"
                    : "text-pen-muted hover:text-pen-foreground",
                )}
              >
                <LayoutGrid className="size-3" />
                <span className="hidden sm:inline">Board</span>
              </button>
            </div>
          </div>
        </div>
      </div>{/* end shrink-0 header */}

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-hidden">
        {view === "list" ? (
          <div className="h-full min-h-0 overflow-x-auto overflow-y-auto">
            {/* Unified tasks + subtasks table — the manager's own work first */}
            <table className={MY_TASKS_TABLE_CLASS}>
              {MY_TASKS_COLGROUP}
              <thead className="sticky top-0 z-10 bg-pen-card">
                <TaskListHeadRow creatorLabel="Creator / Parent" />
              </thead>
              <tbody>
                {pagedRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-20 text-center font-sans text-[13px] text-pen-subtle">
                      No tasks match the current filters.
                    </td>
                  </tr>
                ) : pagedRows.map((row) =>
                  row.kind === "task"
                    ? <TaskListRow key={row.data.dbId} task={row.data} colorMap={colorMap} />
                    : <SubtaskListRow key={row.data.dbId} task={row.data} colorMap={colorMap} />
                )}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex min-w-[540px] items-center justify-between border-t border-pen-card-border bg-pen-card px-4 py-2.5">
                <span className="font-sans text-[11.5px] text-pen-muted">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, allFlatRows.length)}{" "}
                  of {allFlatRows.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-pen-card-border font-sans text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .reduce<(number | "…")[]>((acc, p, i, arr) => {
                      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === "…" ? (
                        <span key={`ellipsis-${i}`} className="flex h-7 w-7 items-center justify-center font-sans text-[11.5px] text-pen-subtle">…</span>
                      ) : (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPage(p as number)}
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-md font-sans text-[11.5px] font-medium transition-colors",
                            page === p
                              ? "bg-pen-blue text-white"
                              : "border border-pen-card-border text-pen-muted hover:bg-pen-surface hover:text-pen-foreground",
                          )}
                        >
                          {p}
                        </button>
                      )
                    )}
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-pen-card-border font-sans text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Manager-only: team review & PR — secondary, collapsed by default */}
            {isManager && reviewTasks.length > 0 && (
              <div className="border-t border-pen-card-border">
                <button
                  type="button"
                  onClick={() => setReviewOpen((v) => !v)}
                  aria-expanded={reviewOpen}
                  className="flex w-full items-center gap-2 bg-pen-card px-4 py-2.5 text-left transition-colors hover:bg-pen-surface/50"
                >
                  <ChevronRight
                    className={cn(
                      "size-3.5 shrink-0 text-pen-subtle transition-transform",
                      reviewOpen && "rotate-90",
                    )}
                  />
                  <Eye className="size-3.5 shrink-0 text-pen-blue" strokeWidth={2} />
                  <span className="font-sans text-[11.5px] font-semibold uppercase tracking-[1.2px] text-pen-muted max-xl:normal-case max-xl:tracking-normal">
                    Team review &amp; pull requests
                  </span>
                  <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-pen-blue/10 px-1.5 font-sans text-[11.5px] font-bold text-pen-blue">
                    {reviewTasks.length}
                  </span>
                  {!reviewOpen && (
                    <span className="truncate font-sans text-[11px] text-pen-subtle max-sm:hidden">
                      — waiting on your team, tap to view
                    </span>
                  )}
                </button>
                {reviewOpen && (
                  <table className={REVIEW_TASKS_TABLE_CLASS}>
                    <thead className="sticky top-0 z-10 bg-pen-card">
                      <ReviewTaskHeadRow />
                    </thead>
                    <tbody>
                      {reviewGroups.map((g) => (
                        <React.Fragment key={g.name}>
                          <tr className="bg-pen-surface/50">
                            <td colSpan={6} className="px-4 py-1.5">
                              <div className="flex items-center gap-2">
                                <UserAvatar name={g.name} avatarUrl={g.avatarUrl ?? undefined} size={18} meta={{}} />
                                <span className="font-sans text-[11.5px] font-semibold text-pen-foreground">
                                  {g.name}
                                </span>
                                <span className="flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-pen-card px-1.5 font-mono text-[10.5px] font-semibold tabular-nums text-pen-muted">
                                  {g.tasks.length}
                                </span>
                              </div>
                            </td>
                          </tr>
                          {g.tasks.map((task) => (
                            <ReviewTaskRow key={task.dbId} task={task} colorMap={colorMap} />
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        ) : (
          <div
            ref={boardScrollRef}
            onMouseDown={handleBoardMouseDown}
            className="@container/board h-full cursor-grab overflow-x-auto overflow-y-hidden px-3 pb-4 active:cursor-grabbing [-webkit-overflow-scrolling:touch] select-none sm:px-4 sm:pb-3"
          >
            <div className="flex h-full items-stretch gap-3 sm:gap-3.5" style={{ width: "max-content" }}>
            {sortedStatuses.map((status) => (
              <BoardColumn
                key={status.id}
                status={status}
                cards={filteredByStatus.get(status.label) ?? []}
                onDrop={moveCard}
                onAdd={setCreateForStatus}
              />
            ))}
            {extraStatusLabels.map((label) => (
              <BoardColumn
                key={label}
                status={{
                  id: label,
                  label,
                  color: "#64748b",
                  order: 999,
                  isComplete: ["Live", "Done", "Completed", "Closed"].includes(label),
                }}
                cards={filteredByStatus.get(label) ?? []}
                onDrop={moveCard}
                onAdd={setCreateForStatus}
              />
            ))}
            </div>
          </div>
        )}
        </div>
      </div>

      {labelChoiceModal}

      {createForStatus && meta && (
        <NewTicketModal
          projects={meta.availableProjects}
          subDepartmentMembers={meta.availableMembers}
          defaultSubDepartmentId={meta.defaultSubDepartmentId ?? undefined}
          defaultStatus={createForStatus}
          statuses={meta.subDepartmentStatuses.map((s) => ({ id: s.id, label: s.label, color: s.color }))}
          onCreated={() => setCreateForStatus(null)}
          onClose={() => setCreateForStatus(null)}
        />
      )}
    </BoardDndProvider>
  );
}