"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePersistedView, VIEW_KEYS } from "@/hooks/use-persisted-view";
import { useQueryClient } from "@tanstack/react-query";
import { ticketKeys } from "@/hooks/queries/keys";
import Link from "next/link";
import { useDrag, useDrop } from "react-dnd";
import { BoardDndProvider } from "@/components/board/board-dnd-provider";
import {
  LayoutGrid,
  AlignJustify,
  Clock,
  MessageCircle,
  Mail,
  ChevronLeft,
  ChevronRight,
  Plus,
  Play,
  Pause,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type BoardCardData,
  type SubCardData,
  type SubDepartmentStatusConfig,
  normalizeStatus,
  UI_STATUS_DOT,
  uiPriorityFromDb,
  formatLoggedTime,
  DEFAULT_STATUSES,
} from "@/components/board/board-types";
import { PriorityDot, PriorityPill } from "@/components/board/priority-indicator";
import { TagPill } from "@/components/board/tag-pill";
import { CardModuleSegment, ModuleCell } from "@/components/board/module-label";
import { UserAvatar } from "@/components/ui/user-avatar";
import { DrawerLink } from "@/components/tickets/drawer-link";
import { StatusPill } from "@/components/board/status-pill";
import { NewTicketModal } from "@/components/tickets/new-ticket-modal";
import { avatarColorFor } from "@/lib/avatar";
import { useSubDepartmentMembers } from "@/hooks/queries/use-board";
import { useSubDepartmentStatuses } from "@/hooks/queries/use-sub-department-statuses";
import { useCardState } from "@/hooks/use-card-state";
import { moveTicket, updateTicket, type TicketDetailProps } from "@/lib/api/tickets";
import { InlineStatusPicker, InlineAssigneePicker } from "@/components/ui/inline-pickers";
import { useLiveTimer } from "@/hooks/use-live-timer";
import { useTimerActions } from "@/hooks/use-timer-actions";
import { useTimerStore, useAuthStore } from "@/store";
import { toast } from "sonner";
import { SortDropdown, type SortKey } from "@/components/tasks/task-filter-dropdown";
import { ListCreatedCell, ListDueCell } from "@/components/tasks/task-list-cells";
import { sortCards } from "@/lib/sort-cards";
import { useLinkedLabelMovePrompt } from "@/hooks/use-linked-label-move-prompt";
import { Button } from "@/components/ui/button";

const DRAG_TYPE = "PROJECT_CARD";
type DragItem = { dbId: string; fromStatus: string };

function truncateTitle(title: string, maxWords = 6): string {
  const words = title.trim().split(/\s+/);
  if (words.length <= maxWords) return title;
  return `${words.slice(0, maxWords).join(" ")}…`;
}

function PersonCell({
  name,
  avatarUrl,
  subDepartment,
  size = 20,
  className,
  userId,
}: {
  name: string;
  avatarUrl?: string | null;
  subDepartment?: string | null;
  size?: number;
  className?: string;
  userId?: string | null;
}) {
  return (
    <span className={cn("inline-flex min-w-0 max-w-full items-center gap-1.5", className)}>
      <UserAvatar
        name={name}
        avatarUrl={avatarUrl}
        userId={userId}
        size={size}
        meta={subDepartment ? { subDepartment } : undefined}
      />
      <span
        className="min-w-0 truncate font-sans text-[12px] text-pen-foreground"
        title={name}
      >
        {name}
      </span>
    </span>
  );
}

function CreatedCell({ iso }: { iso: string }) {
  return <ListCreatedCell iso={iso} />;
}

function ListTableColgroup({ moduleSystemEnabled }: { moduleSystemEnabled: boolean }) {
  return (
    <colgroup>
      <col style={{ width: 28 }} />
      <col style={{ width: 84 }} />
      <col />
      <col style={{ width: 118 }} />
      <col style={{ width: 132 }} />
      {moduleSystemEnabled && <col style={{ width: 120 }} />}
      <col style={{ width: 132 }} />
      <col style={{ width: 76 }} />
      <col style={{ width: 96 }} />
      <col style={{ width: 72 }} />
    </colgroup>
  );
}

function SubTicketRowInline({ sub }: { sub: SubCardData }) {
  const statusColor = UI_STATUS_DOT[normalizeStatus(sub.status)] ?? "#94a3b8";
  return (
    <DrawerLink
      ticketId={sub.dbId}
      href={`/tickets/${sub.dbId}`}
      card={sub}
      className="flex h-[26px] items-center gap-2 rounded px-1.5 hover:bg-pen-surface"
    >
      <span className="block size-[6px] shrink-0 rounded-full" style={{ backgroundColor: statusColor }} />
      <span className="font-mono text-[9.5px] font-semibold text-pen-id shrink-0">{sub.humanId}</span>
      <span className="min-w-0 flex-1 truncate font-sans text-[11.5px] text-pen-foreground">{sub.title}</span>
      {sub.assigneeName && (
        <UserAvatar name={sub.assigneeName} avatarUrl={sub.assigneeAvatarUrl} userId={sub.assigneeId} size={14} meta={{}} />
      )}
    </DrawerLink>
  );
}

function ProjectCard({ card: initialCard, href, canCreate = true }: { card: BoardCardData; href: string; canCreate?: boolean }) {
  const { subTicketCards, expanded, creatingSubTicket, subTotal, subDone, subtasksDone, openSubTicketModal, closeSubTicketModal, toggleExpanded, onSubTicketCreated } = useCardState(initialCard.subTicketCards);
  const { data: effectiveMembers = [] } = useSubDepartmentMembers(initialCard.subDepartmentId);
  const { data: statuses = [] } = useSubDepartmentStatuses(initialCard.subDepartmentId);
  const [startingTimer, setStartingTimer] = useState(false);
  const [stoppingTimer, setStoppingTimer] = useState(false);
  const timerEntryId = useTimerStore((s) => s.entryId);
  const timerTicketDbId = useTimerStore((s) => s.ticketDbId);
  const timerStartedAtMs = useTimerStore((s) => s.startedAtMs);
  const { startTimer, stopTimer } = useTimerActions();
  const userId = useAuthStore((s) => s.user?.id);
  const isRunning = timerTicketDbId === initialCard.dbId;
  const elapsedSecs = useLiveTimer(isRunning ? timerStartedAtMs : null);
  const displaySecs = initialCard.totalLoggedSecs + (isRunning ? elapsedSecs : 0);
  const canTrack =
    normalizeStatus(initialCard.status) === "In Progress" &&
    !!userId &&
    (initialCard.assigneeId === userId || initialCard.coAssignees.some((a) => a.id === userId));

  async function handleStartTimer(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (startingTimer || isRunning) return;
    setStartingTimer(true);
    try {
      await startTimer({
        ticketDbId: initialCard.dbId,
        humanId: initialCard.humanId,
        title: initialCard.title,
      });
      toast.success(`Timer started on ${initialCard.humanId}`);
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
      toast.success(`Timer paused on ${initialCard.humanId}`);
    } catch {
      toast.error("Failed to pause timer");
    } finally {
      setStoppingTimer(false);
    }
  }

  const [{ isDragging }, dragRef] = useDrag<DragItem, void, { isDragging: boolean }>({
    type: DRAG_TYPE,
    item: { dbId: initialCard.dbId, fromStatus: initialCard.status },
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
        ticketId={initialCard.dbId}
        href={href}
        card={initialCard}
        className="flex w-full flex-col gap-2 px-3 py-[10px]"
      >
        <div className="flex h-4 items-center">
          <span className="font-mono text-[11.5px] font-semibold text-pen-foreground">{initialCard.humanId}</span>
          {isRunning && (
            <span className="ml-1.5 flex items-center gap-1 rounded-full bg-pen-green/10 px-1.5 py-px font-sans text-[9.5px] font-semibold text-pen-green">
              <span className="block size-1.5 animate-pulse rounded-full bg-pen-green" />
              Tracking
            </span>
          )}
          <span className="flex-1" />
          <PriorityPill priority={initialCard.priority} status={initialCard.status} />
        </div>

        <p className="font-sans text-[12.5px] font-semibold leading-[18px] text-pen-foreground">{initialCard.title}</p>

        {/* Assignee + co-assignees + QA */}
        <div className="flex items-center gap-1">
          {initialCard.assigneeName ? (
            <>
              <UserAvatar name={initialCard.assigneeName} avatarUrl={initialCard.assigneeAvatarUrl} userId={initialCard.assigneeId} size={14} meta={{}} />
              <span className="font-sans text-[11.5px] text-pen-subtle truncate max-w-[110px]">{initialCard.assigneeName}</span>
            </>
          ) : (
            <>
              <span className="block size-[14px] shrink-0 rounded-full border border-dashed border-pen-subtle" />
              <span className="font-sans text-[11.5px] text-pen-subtle">Unassigned</span>
            </>
          )}
          {(initialCard.coAssignees ?? []).length > 0 && (
            <div className="flex items-center -space-x-1 pl-0.5">
              {(initialCard.coAssignees ?? []).slice(0, 3).map((a: { id: string; name: string; color: string; avatarUrl?: string | null }) => (
                <UserAvatar key={a.id} name={a.name} avatarUrl={a.avatarUrl} userId={a.id} size={14} className="ring-1 ring-pen-card" meta={{}} />
              ))}
              {(initialCard.coAssignees ?? []).length > 3 && (
                <span className="flex size-[14px] shrink-0 items-center justify-center rounded-full bg-pen-surface font-sans text-[9.5px] text-pen-subtle ring-1 ring-pen-card">
                  +{(initialCard.coAssignees ?? []).length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex h-5 items-center gap-1.5">
          <CardModuleSegment moduleName={initialCard.moduleName} withSeparator={false} />
          <span className="flex-1" />
          {initialCard.comments > 0 && (
            <>
              <MessageCircle className="size-[11px] shrink-0 text-pen-subtle" />
              <span className="font-sans text-[11.5px] text-pen-subtle">{initialCard.comments}</span>
            </>
          )}
          {initialCard.messages > 0 && (
            <>
              {initialCard.comments > 0 && <span className="w-1.5" />}
              <Mail
                className="size-[11px] shrink-0 text-pen-subtle"
                aria-label="Customer replies"
              />
              <span className="font-sans text-[11.5px] text-pen-subtle">{initialCard.messages}</span>
            </>
          )}
          <span className="w-1.5" />
          <div className="flex items-center -space-x-1">
            {initialCard.creatorName ? (
              <UserAvatar
                name={initialCard.creatorName}
                avatarUrl={initialCard.creatorAvatarUrl}
                userId={initialCard.creatorId}
                size={18}
                className="ring-1 ring-pen-card"
                meta={{}}
              />
            ) : (
              <span className="block size-[18px] shrink-0 rounded-full border border-dashed border-pen-subtle" />
            )}
          </div>
        </div>

        {(initialCard.labels.length > 0 || (initialCard.lastMessageDirection && !initialCard.isComplete)) && (
          <div className="flex flex-wrap items-center gap-1">
            {initialCard.labels.slice(0, 3).map((lbl) => (
              <TagPill key={lbl} label={lbl} size="sm" />
            ))}
            {initialCard.labels.length > 3 && (
              <span className="font-sans text-[10px] text-pen-subtle">+{initialCard.labels.length - 3}</span>
            )}
            {initialCard.lastMessageDirection && !initialCard.isComplete && (
              <span
                className={cn(
                  "inline-flex items-center whitespace-nowrap py-[2px] font-sans text-[9.5px] font-medium ring-1 ring-inset ring-black/4 dark:ring-white/10",
                  initialCard.lastMessageDirection === "outbound"
                    ? "bg-[#fffbeb] text-[#b45309] dark:bg-[#3a3018] dark:text-[#fcd34d]"
                    : "bg-[#ecfeff] text-[#0e7490] dark:bg-[#143038] dark:text-[#67e8f9]",
                )}
                style={{
                  clipPath: "polygon(0 0, calc(100% - 5px) 0%, 100% 50%, calc(100% - 5px) 100%, 0 100%, 3px 50%)",
                  paddingLeft: "7px",
                  paddingRight: "9px",
                }}
              >
                {initialCard.lastMessageDirection === "outbound" ? "Waiting for customer" : "Waiting for assignee"}
              </span>
            )}
          </div>
        )}

        <div className="h-px bg-[#f0f4f8] dark:bg-pen-card-border" />

        <div className="flex h-4 items-center gap-[5px]">
          <Clock className="size-3 shrink-0 text-pen-muted" />
          {initialCard.startDate && (
            <>
              <span className="font-mono text-[11.5px] font-medium text-pen-muted">{initialCard.startDate}</span>
              <span className="font-mono text-[11.5px] text-pen-subtle">→</span>
            </>
          )}
          <span
            className={cn(
              "font-mono text-[11.5px] font-medium",
              initialCard.due === "Complete" ? "text-pen-green"
                : initialCard.dueOverdue ? "text-pen-red"
                : initialCard.dueUrgent ? "text-amber-500"
                : initialCard.due ? "text-pen-muted"
                : "text-pen-subtle",
            )}
          >
            {initialCard.due ?? (initialCard.startDate ? null : "—")}
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
        {canCreate && (
          <button
            type="button"
            title="Add sub-task"
            onClick={openSubTicketModal}
            className="flex items-center gap-1 rounded px-1 py-0.5 font-sans text-[11.5px] text-pen-subtle transition-colors hover:bg-pen-surface hover:text-pen-blue"
          >
            <Plus className="size-[11px] shrink-0" />
            <span>Sub-task</span>
          </button>
        )}
      </div>
      {subTotal > 0 && expanded && (
        <div className="mx-3 mb-2 border-t border-pen-card-border pt-1">
          {subTicketCards.map((sub) => <SubTicketRowInline key={sub.dbId} sub={sub} />)}
        </div>
      )}

      {creatingSubTicket && (
        <NewTicketModal
          projects={[{ id: initialCard.projectId, name: initialCard.project }]}
          subDepartmentMembers={effectiveMembers}
          subDepartmentMembersForCreate={effectiveMembers}
          defaultProjectId={initialCard.projectId}
          defaultProjectName={initialCard.project}
          defaultSubDepartmentId={initialCard.subDepartmentId}
          lockSubDepartmentId
          statuses={statuses}
          parentId={initialCard.dbId}
          parentHumanId={initialCard.humanId}
          onCreated={onSubTicketCreated}
          onClose={closeSubTicketModal}
        />
      )}
    </div>
  );
}

function ProjectColumn({
  status,
  cards,
  onDrop,
  onAdd,
  makeCardHref,
  canCreate = true,
}: {
  status: SubDepartmentStatusConfig;
  cards: BoardCardData[];
  onDrop: (dbId: string, toStatus: string) => void;
  onAdd: (statusLabel: string) => void;
  makeCardHref: (dbId: string) => string;
  canCreate?: boolean;
}) {
  const [{ isOver, canDrop }, dropRef] = useDrop<
    DragItem,
    void,
    { isOver: boolean; canDrop: boolean }
  >({
    accept: DRAG_TYPE,
    drop: (item) => {
      if (item.fromStatus !== status.label) onDrop(item.dbId, status.label);
    },
    canDrop: (item) => item.fromStatus !== status.label,
    collect: (m) => ({ isOver: m.isOver(), canDrop: m.canDrop() }),
  });
  const isActive = isOver && canDrop;

  return (
    <div
      ref={dropRef as unknown as React.Ref<HTMLDivElement>}
      className={cn(
        "flex h-full w-[280px] shrink-0 flex-col gap-[9px] rounded-[12px] bg-pen-surface px-2.5 py-3 transition-colors sm:w-[300px] lg:w-[min(320px,calc((100cqw-3.5rem)/5))]",
        isActive && "ring-2 ring-inset",
      )}
      style={isActive ? ({ "--tw-ring-color": status.color } as React.CSSProperties) : undefined}
    >
      <div className="flex h-[22px] shrink-0 items-center gap-[7px]">
        <span
          className="block size-2 shrink-0 rounded-full"
          style={{ backgroundColor: status.color }}
        />
        <span className="font-sans text-[12px] font-semibold text-pen-foreground">
          {status.label}
        </span>
        <span className="font-sans text-[11.5px] text-pen-subtle">
          {cards.length}
        </span>
        <span className="flex-1" />
        {canCreate && (
          <button
            type="button"
            onClick={() => onAdd(status.label)}
            className="flex size-[18px] items-center justify-center rounded text-pen-subtle transition-colors hover:bg-pen-card hover:text-pen-foreground"
            aria-label={`Add task to ${status.label}`}
          >
            <Plus className="size-3.5" />
          </button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-[9px] overflow-y-auto">
        {cards.map((card) => (
          <ProjectCard key={card.dbId} card={card} href={makeCardHref(card.dbId)} canCreate={canCreate} />
        ))}
        {cards.length === 0 && (
          <p
            className="py-2 text-center font-sans text-[11.5px] transition-colors"
            style={{ color: isActive ? status.color : undefined }}
          >
            {isActive ? "Drop here" : <span className="text-pen-subtle">No tickets</span>}
          </p>
        )}
        {canCreate && (
          <button
            type="button"
            onClick={() => onAdd(status.label)}
            className="flex w-full items-center gap-1.5 rounded-[7px] px-2 py-1.5 text-pen-subtle transition-colors hover:bg-pen-card-border/50 hover:text-pen-foreground"
          >
            <Plus className="size-3 shrink-0" />
            <span className="font-sans text-[11.5px]">Add task</span>
          </button>
        )}
      </div>
    </div>
  );
}

function ListRow({
  card,
  statusColorMap,
  moduleSystemEnabled = true,
  href,
  onAddSub,
}: {
  card: BoardCardData;
  statusColorMap: Record<string, string>;
  moduleSystemEnabled?: boolean;
  href: string;
  onAddSub?: (parentId: string, parentHumanId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = card.subTicketCards.length > 0;

  // Live state for inline editing
  const [liveStatus, setLiveStatus] = useState(card.status);
  const [liveAssigneeId, setLiveAssigneeId] = useState(card.assigneeId ?? null);
  const [liveAssigneeName, setLiveAssigneeName] = useState(card.assigneeName ?? null);
  const [liveAssigneeAvatarUrl, setLiveAssigneeAvatarUrl] = useState(card.assigneeAvatarUrl ?? null);

  const { data: statuses = [] } = useSubDepartmentStatuses(card.subDepartmentId);
  const { data: members = [] } = useSubDepartmentMembers(card.subDepartmentId);

  const statusColor = statusColorMap[liveStatus] ?? UI_STATUS_DOT[normalizeStatus(liveStatus)] ?? "#94a3b8";

  const [startingTimer, setStartingTimer] = useState(false);
  const [stoppingTimer, setStoppingTimer] = useState(false);
  const timerEntryId = useTimerStore((s) => s.entryId);
  const timerTicketDbId = useTimerStore((s) => s.ticketDbId);
  const timerStartedAtMs = useTimerStore((s) => s.startedAtMs);
  const { startTimer, stopTimer } = useTimerActions();
  const isRunning = timerTicketDbId === card.dbId;
  const elapsedSecs = useLiveTimer(isRunning ? timerStartedAtMs : null);
  const displaySecs = card.totalLoggedSecs + (isRunning ? elapsedSecs : 0);
  const userId = useAuthStore((s) => s.user?.id);
  const canTrack =
    normalizeStatus(liveStatus) === "In Progress" &&
    (card.assigneeId === userId || card.coAssignees.some((a) => a.id === userId));

  async function handleStartTimer(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (startingTimer || isRunning) return;
    setStartingTimer(true);
    try {
      await startTimer({
        ticketDbId: card.dbId,
        humanId: card.humanId,
        title: card.title,
      });
      toast.success(`Timer started on ${card.humanId}`);
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
      toast.success(`Timer paused on ${card.humanId}`);
    } catch {
      toast.error("Failed to pause timer");
    } finally {
      setStoppingTimer(false);
    }
  }

  async function handleStatusChange(newStatus: string, chosenLabel?: string) {
    const prev = liveStatus;
    setLiveStatus(newStatus);
    try {
      await moveTicket(card.dbId, { status: newStatus, chosenLabel });
    } catch {
      setLiveStatus(prev);
      toast.error("Failed to update status");
    }
  }

  async function handleAssigneeChange(member: { id: string; name: string; avatarUrl?: string | null } | null) {
    const prevId = liveAssigneeId;
    const prevName = liveAssigneeName;
    const prevUrl = liveAssigneeAvatarUrl;
    setLiveAssigneeId(member?.id ?? null);
    setLiveAssigneeName(member?.name ?? null);
    setLiveAssigneeAvatarUrl(member?.avatarUrl ?? null);
    try {
      await updateTicket(card.dbId, { assigneeId: member?.id ?? null });
    } catch {
      setLiveAssigneeId(prevId);
      setLiveAssigneeName(prevName);
      setLiveAssigneeAvatarUrl(prevUrl);
      toast.error("Failed to update assignee");
    }
  }

  return (
    <>
      <tr className="group border-b border-[#f0f4f8] transition-colors hover:bg-pen-bg dark:border-[#3a3a37]">
        {/* Priority dot — always shown */}
        <td className="align-middle py-2 pl-3 pr-0">
          <PriorityDot priority={card.priority} status={card.status} />
        </td>
        {/* ID */}
        <td className="align-middle py-2 pl-2 pr-2">
          <DrawerLink ticketId={card.dbId} href={href} className="font-mono text-[11.5px] font-semibold text-pen-id hover:underline">
            {card.humanId}
          </DrawerLink>
        </td>
        {/* Title */}
        <td className="max-w-0 align-middle px-2 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <DrawerLink ticketId={card.dbId} href={href} className="flex min-w-0 shrink items-center gap-2">
              <span className="truncate font-sans text-[13px] text-pen-foreground group-hover:text-pen-id" title={card.title}>
                {truncateTitle(card.title)}
              </span>
            </DrawerLink>
            {card.labels.length > 0 && (
              <div className="flex shrink-0 items-center gap-1">
                {card.labels.slice(0, 3).map((lbl) => (
                  <TagPill key={lbl} label={lbl} size="sm" />
                ))}
                {card.labels.length > 3 && (
                  <span className="font-sans text-[10px] text-pen-subtle">+{card.labels.length - 3}</span>
                )}
              </div>
            )}
            {card.lastMessageDirection && !card.isComplete && (
              <span
                className={cn(
                  "inline-flex shrink-0 items-center whitespace-nowrap py-[2px] font-sans text-[9.5px] font-medium ring-1 ring-inset ring-black/4 dark:ring-white/10",
                  card.lastMessageDirection === "outbound"
                    ? "bg-[#fffbeb] text-[#b45309] dark:bg-[#3a3018] dark:text-[#fcd34d]"
                    : "bg-[#ecfeff] text-[#0e7490] dark:bg-[#143038] dark:text-[#67e8f9]",
                )}
                style={{
                  clipPath: "polygon(0 0, calc(100% - 5px) 0%, 100% 50%, calc(100% - 5px) 100%, 0 100%, 3px 50%)",
                  paddingLeft: "7px",
                  paddingRight: "9px",
                }}
              >
                {card.lastMessageDirection === "outbound" ? "Waiting for customer" : "Waiting for assignee"}
              </span>
            )}
            {hasChildren && (
              <>
                <span className="shrink-0 rounded-full bg-pen-surface px-1.5 py-px font-sans text-[11.5px] text-pen-subtle">
                  {card.subTicketCards.length}
                </span>
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="flex shrink-0 items-center justify-center rounded p-0.5 text-pen-subtle hover:bg-pen-surface hover:text-pen-foreground"
                >
                  <ChevronRight className={cn("size-[12px] transition-transform", expanded && "rotate-90")} />
                </button>
              </>
            )}
            {onAddSub && (
              <button
                type="button"
                onClick={() => onAddSub(card.dbId, card.humanId)}
                className="flex shrink-0 items-center gap-1 rounded px-1 py-px text-pen-subtle transition-opacity hover:bg-pen-surface hover:text-pen-foreground"
              >
                <Plus className="size-3" />
                <span className="font-sans text-[11.5px]">Sub-task</span>
              </button>
            )}
          </div>
        </td>
        {/* Status — inline editable */}
        <td className="hidden align-middle px-2 py-2 md:table-cell">
          <InlineStatusPicker
            subDepartmentId={card.subDepartmentId}
            statuses={statuses}
            current={liveStatus}
            onSelect={handleStatusChange}
          >
            {({ ref, onClick }) => (
              <button
                ref={ref}
                type="button"
                onClick={(e) => { e.stopPropagation(); onClick(); }}
                className="rounded transition-opacity hover:opacity-80"
              >
                <StatusPill status={liveStatus} color={statusColor} size="sm" />
              </button>
            )}
          </InlineStatusPicker>
        </td>
        {/* Assignee — inline editable */}
        <td className="hidden max-w-0 align-middle px-2 py-2 lg:table-cell">
          <InlineAssigneePicker
            members={members}
            currentId={liveAssigneeId}
            onSelect={handleAssigneeChange}
          >
            {({ ref, onClick }) => (
              <button
                ref={ref}
                type="button"
                onClick={(e) => { e.stopPropagation(); onClick(); }}
                className="flex min-w-0 max-w-full items-center rounded px-1 py-0.5 text-left transition-colors hover:bg-pen-surface"
              >
                {liveAssigneeName ? (
                  <PersonCell
                    name={liveAssigneeName}
                    avatarUrl={liveAssigneeAvatarUrl}
                    userId={liveAssigneeId}
                    size={20}
                  />
                ) : (
                  <span className="font-sans text-[11.5px] text-pen-subtle">Unassigned</span>
                )}
              </button>
            )}
          </InlineAssigneePicker>
        </td>
        {/* Module */}
        {moduleSystemEnabled && (
          <td className="hidden max-w-0 align-middle px-2 py-2 xl:table-cell">
            <ModuleCell moduleName={card.moduleName} />
          </td>
        )}
        {/* Creator */}
        <td className="hidden max-w-0 align-middle px-2 py-2 xl:table-cell">
          {card.creatorName?.trim() ? (
            <PersonCell
              name={card.creatorName}
              avatarUrl={card.creatorAvatarUrl}
              userId={card.creatorId}
              size={20}
            />
          ) : (
            <span className="font-sans text-[11.5px] text-pen-subtle">—</span>
          )}
        </td>
        {/* Logged time */}
        <td className="hidden align-middle px-2 py-2 sm:table-cell">
          <div className="flex items-center gap-1">
            {isRunning && <span className="block size-[7px] shrink-0 animate-pulse rounded-full bg-pen-green" />}
            <span className={cn("font-mono text-[11.5px]", isRunning ? "text-pen-green" : "text-pen-muted")}>
              {formatLoggedTime(displaySecs) ?? "—"}
            </span>
            {isRunning ? (
              <button
                type="button"
                title="Pause timer"
                onClick={handleStopTimer}
                disabled={stoppingTimer}
                className="flex size-[18px] shrink-0 items-center justify-center rounded text-pen-red transition-opacity hover:bg-pen-red/10 disabled:cursor-wait"
              >
                <Pause className="size-[9px] fill-current" />
              </button>
            ) : canTrack && (
              <button
                type="button"
                title="Start timer"
                onClick={handleStartTimer}
                disabled={startingTimer}
                className="flex size-[18px] shrink-0 items-center justify-center rounded text-pen-subtle transition-opacity hover:bg-pen-surface hover:text-pen-blue disabled:cursor-wait"
              >
                <Play className="size-[10px]" />
              </button>
            )}
          </div>
        </td>
        {/* Created */}
        <td className="hidden align-middle px-2 py-2 md:table-cell">
          <CreatedCell iso={card.createdIso} />
        </td>
        {/* Due */}
        <td className="align-middle px-2 py-2 pr-3">
          <ListDueCell
            due={card.due}
            dueOverdue={card.dueOverdue}
            dueUrgent={card.dueUrgent}
            align="left"
          />
        </td>
      </tr>
      {expanded && hasChildren && card.subTicketCards.map((sub, idx) => {
        const subColor = statusColorMap[sub.status] ?? UI_STATUS_DOT[normalizeStatus(sub.status)] ?? "#94a3b8";
        const isLast = idx === card.subTicketCards.length - 1;
        return (
          <tr key={sub.dbId} className="border-b border-[#f0f4f8] bg-pen-bg transition-colors hover:bg-pen-surface dark:border-[#3a3a37]">
            {/* Tree line decoration in the ● column */}
            <td className="align-middle py-2 pl-3 pr-0">
              <div className="relative flex h-[22px] w-4 items-center justify-center text-pen-card-border">
                <div className={cn("absolute left-[7px] w-px bg-pen-card-border", isLast ? "top-0 h-1/2" : "inset-y-0")} />
                <div className="absolute top-1/2 left-[7px] h-px w-[9px] bg-pen-card-border" />
              </div>
            </td>
            <td className="align-middle py-2 pl-2 pr-2">
              <DrawerLink ticketId={sub.dbId} href={`/tickets/${sub.dbId}`} className="font-mono text-[11.5px] font-semibold text-pen-id hover:underline">
                {sub.humanId}
              </DrawerLink>
            </td>
            <td className="max-w-0 align-middle px-2 py-2">
              <DrawerLink ticketId={sub.dbId} href={`/tickets/${sub.dbId}`} className="flex min-w-0 items-center">
                <span className="truncate font-sans text-[12px] text-pen-foreground">{sub.title}</span>
              </DrawerLink>
            </td>
            <td className="hidden align-middle px-2 py-2 md:table-cell">
              <StatusPill status={sub.status} color={subColor} size="sm" />
            </td>
            <td className="hidden max-w-0 align-middle px-2 py-2 lg:table-cell">
              {sub.assigneeName ? (
                <PersonCell
                  name={sub.assigneeName}
                  avatarUrl={sub.assigneeAvatarUrl}
                  userId={sub.assigneeId}
                  size={20}
                />
              ) : (
                <span className="font-sans text-[11.5px] text-pen-subtle">—</span>
              )}
            </td>
            {moduleSystemEnabled && <td className="hidden px-2 py-2 xl:table-cell" />}
            <td className="hidden px-2 py-2 xl:table-cell" />
            <td className="hidden px-2 py-2 sm:table-cell" />
            <td className="hidden px-2 py-2 md:table-cell" />
            <td className="px-2 py-2 pr-3" />
          </tr>
        );
      })}
    </>
  );
}

type Member = { initials: string; name: string; bg: string };
import type { UserListPerson } from "@/lib/user-list-person";

type SubDepartmentMemberForCreate = UserListPerson;

export type ProjectBoardFilters = {
  priority: Set<string>;
  labels: Set<string>;
  assignee: Set<string>;
  module: Set<string>;
};

const UNASSIGNED_ASSIGNEE = "__unassigned__";
export const MODULE_ZERO_FILTER_ID = "__module0__";

function matchesBoardFilters(
  card: BoardCardData,
  filters?: ProjectBoardFilters,
): boolean {
  if (!filters) return true;
  if (filters.priority.size > 0 && !filters.priority.has(card.priority)) {
    return false;
  }
  if (
    filters.labels.size > 0 &&
    !card.labels.some((l) => filters.labels.has(l))
  ) {
    return false;
  }
  if (filters.assignee.size > 0) {
    const key = card.assigneeId ?? UNASSIGNED_ASSIGNEE;
    if (!filters.assignee.has(key)) return false;
  }
  if (filters.module.size > 0) {
    const key = card.moduleId ?? MODULE_ZERO_FILTER_ID;
    if (!filters.module.has(key)) return false;
  }
  return true;
}

type Props = {
  name: string;
  description: string;
  color: string;
  members: Member[];
  extraMembers: number;
  cards: BoardCardData[];
  statuses: SubDepartmentStatusConfig[];
  hideHeader?: boolean;
  /** Project context for inline ticket creation */
  projectId?: string;
  /** The actual project name (shown locked in the create modal) */
  projectName?: string;
  /** Project slug for back-navigation breadcrumb links */
  projectSlug?: string;
  /** Team context for inline ticket creation — tickets are stamped with this team */
  subDepartmentId?: string;
  /** Members of this team to show in the assignee dropdown */
  subDepartmentMembersForCreate?: SubDepartmentMemberForCreate[];
  /** Hides the list-view Module column when the project has no module system */
  moduleSystemEnabled?: boolean;
  /** When provided by a parent, the internal toggle is hidden and this controls the view */
  externalView?: "board" | "list";
  /** Ref forwarded from a parent so it can scroll the board container */
  scrollerRef?: React.RefObject<HTMLDivElement | null>;
  /** Optional filters controlled by a parent toolbar */
  boardFilters?: ProjectBoardFilters;
  /** Support projects show boards but never allow manual task creation */
  supportProject?: boolean;
  /** When false, boards are view-only (department viewer not assigned to the project). */
  canModifyProject?: boolean;
};

export function ProjectBoardPage({
  name,
  description,
  color,
  members,
  extraMembers,
  cards: initialCards,
  statuses,
  hideHeader = false,
  moduleSystemEnabled = true,
  projectId,
  projectName,
  projectSlug,
  subDepartmentId,
  subDepartmentMembersForCreate,
  externalView,
  scrollerRef,
  boardFilters,
  supportProject = false,
  canModifyProject = true,
}: Props) {
  const canCreate = canModifyProject && !supportProject;
  const queryClient = useQueryClient();
  const moveTimerEntryId = useTimerStore((s) => s.entryId);
  const moveTimerTicketDbId = useTimerStore((s) => s.ticketDbId);
  const { stopTimer: stopTimerOnMove } = useTimerActions();
  const { data: clientStatuses = [] } = useSubDepartmentStatuses(subDepartmentId ?? "");
  const effectiveStatuses = useMemo(() => {
    if (subDepartmentId && clientStatuses.length > 0) return clientStatuses;
    if (statuses.length > 0) return statuses;
    if (clientStatuses.length > 0) return clientStatuses;
    return DEFAULT_STATUSES;
  }, [subDepartmentId, statuses, clientStatuses]);

  const [localCards, setLocalCards] = useState<BoardCardData[]>(initialCards);
  const [sortKey, setSortKey] = useState<SortKey>("created");

  // Sync server-pushed updates into local state when router.refresh() delivers
  // new initialCards from the Supabase realtime subscription.
  useEffect(() => {
    setLocalCards(initialCards);
  }, [initialCards]);

  const [internalView, setInternalView] = usePersistedView(VIEW_KEYS.boardLayout, "board", ["board", "list"] as const);
  const view = externalView ?? internalView;
  const setView = externalView === undefined ? setInternalView : () => {};
  const [createForStatus, setCreateForStatus] = useState<string | null>(null);
  const [createSubFor, setCreateSubFor] = useState<{ parentId: string; parentHumanId: string } | null>(null);

  // Horizontal drag-to-scroll for the board container
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

  const makeCardHref = useCallback((dbId: string): string => {
    if (!projectId || !subDepartmentId) return `/tickets/${dbId}`;
    const params = new URLSearchParams({
      from: "project",
      projectId,
      projectSlug: projectSlug ?? projectId,
      projectName: projectName ?? name,
      tab: `team:${subDepartmentId}`,
      subDepartmentName: name,
      subDepartmentId,
    });
    return `/tickets/${dbId}?${params.toString()}`;
  }, [projectId, projectSlug, projectName, subDepartmentId, name]);

  const handleCreated = useCallback((ticket: {
    id: string; title: string; status: string; priority: string;
    subDepartmentPrefix: string; ticketNumber: number;
    assigneeId: string | null; assigneeName: string | null;
  }) => {
    const newCard: BoardCardData = {
      dbId: ticket.id,
      humanId: `${ticket.subDepartmentPrefix}-${ticket.ticketNumber}`,
      title: ticket.title,
      priority: uiPriorityFromDb(ticket.priority),
      status: ticket.status,
      subDepartment: name,
      subDepartmentId: subDepartmentId ?? "",
      project: name,
      projectId: projectId ?? "",
      projectKind: "standard",
      projectColor: color,
      moduleId: null,
      moduleName: null,
      labels: [],
      comments: 0,
      messages: 0,
      attachments: 0,
      subDone: 0,
      subTotal: 0,
      subTicketCards: [],
      assigneeId: ticket.assigneeId,
      assigneeName: ticket.assigneeName,
      avatarColor: ticket.assigneeName ? avatarColorFor(ticket.assigneeName) : null,
      coAssignees: [],
      creatorId: "",
      creatorName: "",
      time: null,
      totalLoggedSecs: 0,
      userLoggedSecs: 0,
      estimatedTime: null,
      startDate: null,
      startDateIso: null,
      due: null,
      dueDateIso: null,
      dueUrgent: false,
      dueOverdue: false,
      targetDateIsos: [],
      createdIso: new Date().toISOString(),
      hasIntake: false,
      isComplete: false,
      lastMessageDirection: null,
    };
    setLocalCards((prev) => [...prev, newCard]);
  }, [name, color]);

  const handleSubCreated = useCallback((parentId: string, ticket: {
    id: string; title: string; status: string; priority: string;
    subDepartmentPrefix: string; ticketNumber: number;
    assigneeId: string | null; assigneeName: string | null;
  }) => {
    const newSub: SubCardData = {
      dbId: ticket.id,
      humanId: `${ticket.subDepartmentPrefix}-${ticket.ticketNumber}`,
      title: ticket.title,
      status: ticket.status,
      done: false,
      priority: uiPriorityFromDb(ticket.priority),
      assigneeId: ticket.assigneeId,
      assigneeName: ticket.assigneeName,
      avatarColor: ticket.assigneeName ? avatarColorFor(ticket.assigneeName) : null,
      startDateIso: null,
      dueDateIso: null,
    };
    setLocalCards((prev) => prev.map((c) =>
      c.dbId === parentId
        ? { ...c, subTicketCards: [...c.subTicketCards, newSub], subTotal: c.subTotal + 1 }
        : c,
    ));
  }, []);

  const resolveStatusesForCard = useCallback(
    (_subDepartmentId: string) => effectiveStatuses,
    [effectiveStatuses],
  );

  const doMove = useCallback((dbId: string, toStatus: string, chosenLabel?: string) => {
    if (
      moveTimerTicketDbId === dbId &&
      normalizeStatus(toStatus) !== "In Progress"
    ) {
      stopTimerOnMove(moveTimerEntryId).catch(() => undefined);
    }
    const prevDetail = queryClient.getQueryData<TicketDetailProps>(
      ticketKeys.detail(dbId),
    );
    queryClient.setQueryData<TicketDetailProps>(
      ticketKeys.detail(dbId),
      (old) => (old ? { ...old, status: toStatus } : old),
    );
    setLocalCards((prev) => {
      moveTicket(dbId, { status: toStatus, chosenLabel })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ticketKeys.detail(dbId) });
        })
        .catch(() => {
          setLocalCards(prev);
          if (prevDetail !== undefined) {
            queryClient.setQueryData(ticketKeys.detail(dbId), prevDetail);
          }
          toast.error("Failed to move ticket", { description: "The card has been moved back." });
        });
      return prev.map((c) =>
        c.dbId === dbId ? { ...c, status: toStatus } : c,
      );
    });
  }, [queryClient, moveTimerTicketDbId, moveTimerEntryId, stopTimerOnMove]);

  const getCardSubDepartmentId = useCallback(
    (dbId: string) => localCards.find((c) => c.dbId === dbId)?.subDepartmentId,
    [localCards],
  );

  const { tryMove: moveCard, modal: labelChoiceModal } = useLinkedLabelMovePrompt({
    resolveStatusesForCard,
    getCardSubDepartmentId,
    onMove: doMove,
  });

  const statusColorMap = Object.fromEntries(
    effectiveStatuses.map((s) => [s.label, s.color]),
  );

  const filteredCards = useMemo(
    () => localCards.filter((c) => matchesBoardFilters(c, boardFilters)),
    [localCards, boardFilters],
  );

  const sortedCards = useMemo(
    () => sortCards(filteredCards, sortKey),
    [filteredCards, sortKey],
  );
  const defaultCreateStatus = effectiveStatuses[0]?.label ?? "To Do";
  const openCreateTask = useCallback(() => {
    setCreateForStatus(defaultCreateStatus);
  }, [defaultCreateStatus]);

  // Pre-index by status for O(1) per-column lookup in the board render
  const cardsByStatus = useMemo(() => {
    const map = new Map<string, BoardCardData[]>();
    for (const c of sortedCards) {
      const arr = map.get(c.status);
      if (arr) arr.push(c);
      else map.set(c.status, [c]);
    }
    return map;
  }, [sortedCards]);

  const projects = projectId ? [{ id: projectId, name: projectName ?? name }] : [];

  return (
    <BoardDndProvider>
      {labelChoiceModal}
      {createForStatus && projectId && (
        <NewTicketModal
          projects={projects}
          subDepartmentMembers={[]}
          defaultProjectId={projectId}
          defaultProjectName={projectName ?? name}
          defaultSubDepartmentId={subDepartmentId}
          lockSubDepartmentId
          defaultStatus={createForStatus}
          statuses={effectiveStatuses}
          subDepartmentMembersForCreate={subDepartmentMembersForCreate}
          onCreated={handleCreated}
          onClose={() => setCreateForStatus(null)}
        />
      )}
      {createSubFor && projectId && (
        <NewTicketModal
          projects={projects}
          subDepartmentMembers={[]}
          defaultProjectId={projectId}
          defaultProjectName={projectName ?? name}
          defaultSubDepartmentId={subDepartmentId}
          lockSubDepartmentId
          statuses={effectiveStatuses}
          subDepartmentMembersForCreate={subDepartmentMembersForCreate}
          parentId={createSubFor.parentId}
          parentHumanId={createSubFor.parentHumanId}
          onCreated={(ticket) => { handleSubCreated(createSubFor.parentId, ticket); setCreateSubFor(null); }}
          onClose={() => setCreateSubFor(null)}
        />
      )}
      <div className="flex h-full min-w-0 flex-col overflow-hidden">
        <div className={cn("mb-3 flex shrink-0 flex-wrap items-center gap-3 px-4 sm:mb-4 sm:px-6 xl:px-8", hideHeader && "hidden")}>
          <div className="flex items-center gap-2.5">
            <span
              className="block size-4 shrink-0 rounded-[4px]"
              style={{ backgroundColor: color }}
            />
            <div className="flex flex-col gap-px">
              <h1 className="pen-text-page-title leading-none">
                {name}
              </h1>
              <p className="font-sans text-[12px] text-pen-muted">
                {description}
              </p>
            </div>
          </div>
          <span className="flex-1" />
          <div className="flex items-center">
            {members.map((av, i) => (
              <span
                key={`${av.initials}-${i}`}
                title={av.name}
                className={cn(
                  "flex size-[30px] shrink-0 items-center justify-center rounded-full border-2 border-pen-card font-sans text-[11.5px] font-medium text-white",
                  i > 0 && "-ml-2",
                )}
                style={{ backgroundColor: av.bg }}
              >
                {av.initials}
              </span>
            ))}
            {extraMembers > 0 && (
              <span className="-ml-2 flex size-[30px] shrink-0 items-center justify-center rounded-full border-2 border-pen-card bg-pen-surface font-sans text-[11.5px] font-medium text-pen-muted dark:bg-[#3a3a36]">
                +{extraMembers}
              </span>
            )}
          </div>
        </div>

        {externalView === undefined && (
          <div className={cn("flex shrink-0 items-center gap-2 px-4 sm:px-6 xl:px-8", view === "board" ? "mb-3 sm:mb-4" : "mb-0 border-b border-pen-card-border pb-2 pt-2")}>
            <div className="flex h-7 overflow-hidden rounded-md border border-pen-card-border bg-pen-card">
              {(["board", "list"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-label={v === "board" ? "Board view" : "List view"}
                  className={cn(
                    "flex h-[26px] items-center gap-1.5 px-2.5 font-sans text-[11.5px] font-medium transition-colors sm:px-3",
                    view === v
                      ? "rounded-md bg-pen-blue-tint font-semibold text-pen-id"
                      : "text-pen-muted hover:text-pen-foreground",
                  )}
                >
                  {v === "board" ? (
                    <LayoutGrid className="size-3 shrink-0" />
                  ) : (
                    <AlignJustify className="size-3 shrink-0" />
                  )}
                  <span className="hidden sm:inline">{v === "board" ? "Board" : "List"}</span>
                </button>
              ))}
            </div>
            <span className="flex-1" />
            <SortDropdown value={sortKey} onChange={(v) => setSortKey(v as SortKey)} />
            <span className="font-sans text-[11.5px] text-pen-subtle">
              {filteredCards.length === localCards.length
                ? `${localCards.length} tickets`
                : `${filteredCards.length} of ${localCards.length} tickets`}
            </span>
          </div>
        )}


        {view === "board" ? (
          <div
            ref={(el) => {
              (boardScrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
              if (scrollerRef) (scrollerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
            }}
            onMouseDown={handleBoardMouseDown}
            className="@container/board min-h-0 min-w-0 flex-1 cursor-grab overflow-x-auto overflow-y-hidden px-3 pt-2 pb-4 select-none active:cursor-grabbing [-webkit-overflow-scrolling:touch] sm:px-4 sm:pt-3 sm:pb-3"
          >
            <div className="flex h-full min-h-[320px] items-stretch gap-3 sm:gap-3.5" style={{ width: "max-content" }}>
            {effectiveStatuses.map((status) => (
              <ProjectColumn
                key={status.id}
                status={status}
                cards={cardsByStatus.get(status.label) ?? []}
                onDrop={moveCard}
                onAdd={setCreateForStatus}
                makeCardHref={makeCardHref}
                canCreate={canCreate}
              />
            ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
            <table
              className={cn(
                "w-full table-fixed border-collapse text-left",
                moduleSystemEnabled ? "min-w-[1140px]" : "min-w-[1020px]",
              )}
            >
              <ListTableColgroup moduleSystemEnabled={moduleSystemEnabled} />
              <thead className="sticky top-0 z-10 bg-pen-card">
                <tr className="border-b border-pen-card-border">
                  <th className="py-2 pl-3 pr-0 text-left pen-text-table-head">●</th>
                  <th className="py-2 pl-2 pr-2 text-left pen-text-table-head">ID</th>
                  <th className="px-2 py-2 text-left pen-text-table-head">Title</th>
                  <th className="hidden px-2 py-2 text-left pen-text-table-head md:table-cell">Status</th>
                  <th className="hidden px-2 py-2 text-left pen-text-table-head lg:table-cell">Assignee</th>
                  {moduleSystemEnabled && (
                    <th className="hidden px-2 py-2 text-left pen-text-table-head xl:table-cell">Module</th>
                  )}
                  <th className="hidden px-2 py-2 text-left pen-text-table-head xl:table-cell">Creator</th>
                  <th className="hidden px-2 py-2 text-left pen-text-table-head sm:table-cell">Logged</th>
                  <th className="hidden px-2 py-2 text-left pen-text-table-head md:table-cell">Created</th>
                  <th className="px-2 py-2 pr-3 text-left pen-text-table-head">Due</th>
                </tr>
              </thead>
              <tbody>
                {sortedCards.length > 0 ? (
                  sortedCards.map((card) => (
                    <ListRow
                      key={card.dbId}
                      card={card}
                      statusColorMap={statusColorMap}
                      moduleSystemEnabled={moduleSystemEnabled}
                      href={makeCardHref(card.dbId)}
                      onAddSub={canCreate && projectId ? (pid, phid) => setCreateSubFor({ parentId: pid, parentHumanId: phid }) : undefined}
                    />
                  ))
                ) : (
                  <tr>
                    <td colSpan={moduleSystemEnabled ? 10 : 9} className="py-24">
                      <div className="flex flex-col items-center justify-center gap-3 text-center">
                        <p className="font-sans text-[14px] font-medium text-pen-foreground">
                          No tickets in this team yet
                        </p>
                        <p className="max-w-sm font-sans text-[13px] text-pen-muted">
                          Create a task to start tracking work for {name}.
                        </p>
                        {projectId && canCreate && (
                          <Button
                            type="button"
                            size="sm"
                            className="mt-1"
                            onClick={openCreateTask}
                          >
                            <Plus data-icon="inline-start" className="size-3.5" />
                            Add task
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {projectId && canCreate && sortedCards.length > 0 && (
                  <tr>
                    <td colSpan={moduleSystemEnabled ? 10 : 9} className="px-4 py-1.5">
                      <button
                        type="button"
                        onClick={openCreateTask}
                        className="flex w-full items-center gap-1.5 rounded-[7px] px-2 py-1.5 text-pen-subtle transition-colors hover:bg-pen-card-border/50 hover:text-pen-foreground"
                      >
                        <Plus className="size-3 shrink-0" />
                        <span className="font-sans text-[11.5px]">Add task</span>
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </BoardDndProvider>
  );
}
