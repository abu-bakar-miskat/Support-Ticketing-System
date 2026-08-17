"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useQueryClient, useQueries } from "@tanstack/react-query";
import { ticketKeys, teamKeys } from "@/hooks/queries/keys";
import { getTeamStatuses } from "@/lib/api/teams";
import { NewTicketModal } from "@/components/tickets/new-ticket-modal";
import { DrawerLink } from "@/components/tickets/drawer-link";
import { useDrag, useDrop } from "react-dnd";
import { BoardDndProvider } from "@/components/board/board-dnd-provider";
import {
  Clock,
  MessageCircle,
  Mail,
  ChevronLeft,
  ChevronRight,
  Plus,
  Play,
  Pause,
  SquareKanban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { avatarColorFor } from "@/lib/avatar";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  type BoardCardData,
  type SubCardData,
  type TeamStatusConfig,
  type TeamBoardGroup,
  DEFAULT_STATUSES,
  normalizeStatus,
  UI_STATUS_DOT,
  formatLoggedTime,
  uiPriorityFromDb,
} from "@/components/board/board-types";
import { PriorityPill } from "@/components/board/priority-indicator";
import { TagPill } from "@/components/board/tag-pill";
import { CardModuleSegment } from "@/components/board/module-label";
import { BoardCardContextMenu } from "@/components/board/board-card-context-menu";
import { ProjectDot } from "@/components/projects/project-avatar";
import { useTasksMeta } from "@/hooks/queries/use-tasks";
import { useTeamStatuses } from "@/hooks/queries/use-team-statuses";
import { useDashboardContext } from "@/components/dashboard/dashboard-context";
import { useCardState } from "@/hooks/use-card-state";
import { useLiveTimer } from "@/hooks/use-live-timer";
import { useTimerActions } from "@/hooks/use-timer-actions";
import { useTimerStore } from "@/store";
import { moveTicket, MoveTicketError, type TicketDetailProps } from "@/lib/api/tickets";
import { toast } from "sonner";
import { useLinkedLabelMovePrompt } from "@/hooks/use-linked-label-move-prompt";
import { BoardFilterBar } from "@/components/board/board-filter-bar";
import {
  SortDropdown,
  type SortKey,
} from "@/components/tasks/task-filter-dropdown";
import { usePersistedBoardFilters } from "@/hooks/use-persisted-board-filters";
import { sortCards } from "@/lib/sort-cards";
import type { UserListPerson } from "@/lib/user-list-person";
import {
  matchesAssigneeFilter,
  matchesPriorityFilter,
  matchesDateFilter,
  matchesDueRange,
  matchesTargetDateFilter,
  matchesTargetDateRange,
  matchesIntakeFilter,
  matchesProjectFilter,
  matchesLabelFilter,
  matchesModuleFilter,
  collectAssignees,
  collectProjects,
  collectLabels,
  collectModules,
  countAssigneeMatches,
} from "@/components/board/board-filters";

// ── DnD types ─────────────────────────────────────────────────────────────────

const DRAG_TYPE = "BOARD_CARD";
type DragItem = { dbId: string; fromStatus: string };

// ── Sub-ticket expanded row ────────────────────────────────────────────────────

function SubTicketRow({ sub }: { sub: SubCardData }) {
  const statusColor = UI_STATUS_DOT[normalizeStatus(sub.status)] ?? "#94a3b8";
  return (
    <DrawerLink
      ticketId={sub.dbId}
      href={`/tickets/${sub.dbId}`}
      card={sub}
      className="flex h-[28px] items-center gap-2 rounded-md px-2 hover:bg-pen-surface"
    >
      <span
        className="block size-[6px] shrink-0 rounded-full"
        style={{ backgroundColor: statusColor }}
      />
      <span className="font-mono text-[11.5px] font-semibold text-pen-id shrink-0">
        {sub.humanId}
      </span>
      <span className="min-w-0 flex-1 truncate font-sans text-[11.5px] text-pen-foreground">
        {sub.title}
      </span>
      {sub.assigneeName && (
        <UserAvatar
          name={sub.assigneeName}
          avatarUrl={sub.assigneeAvatarUrl}
          userId={sub.assigneeId}
          size={16}
          meta={{}}
        />
      )}
    </DrawerLink>
  );
}

// ── Card ───────────────────────────────────────────────────────────────────────

function BoardCard({
  card: initialCard,
  membersForCreate,
  membersLoading,
}: {
  card: BoardCardData;
  membersForCreate: UserListPerson[];
  membersLoading: boolean;
}) {
  const {
    subTicketCards,
    expanded,
    creatingSubTicket,
    subTotal,
    subDone,
    subtasksDone,
    openSubTicketModal,
    closeSubTicketModal,
    toggleExpanded,
    onSubTicketCreated,
  } = useCardState(initialCard.subTicketCards);
  const teamMembers = membersForCreate;
  const { data: statuses = [] } = useTeamStatuses(initialCard.teamId);
  const [startingTimer, setStartingTimer] = useState(false);
  const [stoppingTimer, setStoppingTimer] = useState(false);

  const timerEntryId = useTimerStore((s) => s.entryId);
  const timerTicketDbId = useTimerStore((s) => s.ticketDbId);
  const timerStartedAtMs = useTimerStore((s) => s.startedAtMs);
  const timerKind = useTimerStore((s) => s.kind);
  const { startTimer, stopTimer } = useTimerActions();
  // Board controls track DEVELOPMENT time only — ignore QA timers here
  const isRunning =
    timerTicketDbId === initialCard.dbId && timerKind !== "QA";
  const elapsedSecs = useLiveTimer(isRunning ? timerStartedAtMs : null);
  const displaySecs =
    initialCard.totalLoggedSecs + (isRunning ? elapsedSecs : 0);
  const currentUser = useCurrentUser();
  const userId = currentUser?.id;
  const canTrack =
    normalizeStatus(initialCard.status) === "In Progress" &&
    (initialCard.assigneeId === userId ||
      initialCard.coAssignees.some((a) => a.id === userId));

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

  const [{ isDragging }, dragRef] = useDrag<
    DragItem,
    void,
    { isDragging: boolean }
  >({
    type: DRAG_TYPE,
    item: { dbId: initialCard.dbId, fromStatus: initialCard.status },
    collect: (m) => ({ isDragging: m.isDragging() }),
  });

  return (
    <BoardCardContextMenu card={initialCard}>
    <div
      ref={dragRef as unknown as React.Ref<HTMLDivElement>}
      className={cn(
        "group/card board-card cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40",
        isRunning && "ring-2 ring-pen-green/45 border-pen-green/50",
      )}
    >
      {/* Main card body — opens drawer */}
      <DrawerLink
        ticketId={initialCard.dbId}
        href={`/tickets/${initialCard.dbId}?from=board`}
        card={initialCard}
        className="flex w-full flex-col gap-2 px-3 py-[10px]"
      >
        <div className="flex h-4 items-center">
          <span className="font-mono text-[11.5px] font-semibold text-pen-foreground">
            {initialCard.humanId}
          </span>
          {isRunning && (
            <span className="ml-1.5 flex items-center gap-1 rounded-full bg-pen-green/10 px-1.5 py-px font-sans text-[9.5px] font-semibold text-pen-green">
              <span className="block size-1.5 animate-pulse rounded-full bg-pen-green" />
              Tracking
            </span>
          )}
          <span className="flex-1" />
          <PriorityPill
            priority={initialCard.priority}
            status={initialCard.status}
          />
        </div>

        <p className="font-sans text-[12.5px] font-semibold leading-[18px] text-pen-foreground">
          {initialCard.title}
        </p>

        {/* Assignee + co-assignees + QA */}
        <div className="flex items-center gap-1">
          {initialCard.assigneeName ? (
            <>
              <UserAvatar
                name={initialCard.assigneeName}
                avatarUrl={initialCard.assigneeAvatarUrl}
                userId={initialCard.assigneeId}
                size={14}
                meta={{}}
              />
              <span className="font-sans text-[11.5px] text-pen-subtle truncate max-w-[110px]">
                {initialCard.assigneeName}
              </span>
            </>
          ) : (
            <>
              <span className="block size-[14px] shrink-0 rounded-full border border-dashed border-pen-subtle" />
              <span className="font-sans text-[11.5px] text-pen-subtle">
                Unassigned
              </span>
            </>
          )}
          {initialCard.coAssignees.length > 0 && (
            <div className="flex items-center -space-x-1 pl-0.5">
              {initialCard.coAssignees.slice(0, 3).map((a) => (
                <UserAvatar
                  key={a.id}
                  name={a.name}
                  avatarUrl={a.avatarUrl}
                  userId={a.id}
                  size={14}
                  className="ring-1 ring-pen-card"
                  meta={{}}
                />
              ))}
              {initialCard.coAssignees.length > 3 && (
                <span className="flex size-[14px] shrink-0 items-center justify-center rounded-full bg-pen-surface font-sans text-[9.5px] text-pen-subtle ring-1 ring-pen-card">
                  +{initialCard.coAssignees.length - 3}
                </span>
              )}
            </div>
          )}
          {(initialCard.qaAssignees?.length ?? 0) > 0 && (
            <div
              className="flex items-center gap-0.5 border-l border-pen-card-border pl-1.5 ml-0.5"
              title={`QA: ${initialCard.qaAssignees.map((a) => a.name).join(", ")}`}
            >
              <span className="font-sans text-[9px] font-semibold uppercase tracking-wide text-[#0d9488]">
                QA
              </span>
              <div className="flex items-center -space-x-1">
                {initialCard.qaAssignees.slice(0, 3).map((a) => (
                  <UserAvatar
                    key={a.id}
                    name={a.name}
                    avatarUrl={a.avatarUrl}
                    userId={a.id}
                    size={14}
                    className="ring-1 ring-[#0d9488]/40"
                    meta={{}}
                  />
                ))}
                {initialCard.qaAssignees.length > 3 && (
                  <span className="flex size-[14px] shrink-0 items-center justify-center rounded-full bg-[#0d948815] font-sans text-[9.5px] text-[#0d9488] ring-1 ring-[#0d9488]/40">
                    +{initialCard.qaAssignees.length - 3}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex h-5 items-center gap-1.5">
          {initialCard.project && (
            <>
              <ProjectDot
                color={initialCard.projectColor ?? "#0a76b9"}
                avatarUrl={initialCard.projectAvatarUrl}
                name={initialCard.project}
                size={16}
              />
              <span className="font-sans text-[11.5px] text-pen-subtle truncate max-w-[90px]">
                {initialCard.project}
              </span>
            </>
          )}
          <CardModuleSegment
            moduleName={initialCard.moduleName}
            withSeparator={!!initialCard.project}
          />
          <span className="flex-1" />
          {initialCard.comments > 0 && (
            <>
              <MessageCircle className="size-[11px] shrink-0 text-pen-subtle" />
              <span className="font-sans text-[11.5px] text-pen-subtle">
                {initialCard.comments}
              </span>
            </>
          )}
          {initialCard.messages > 0 && (
            <>
              {initialCard.comments > 0 && <span className="w-1.5" />}
              <Mail
                className="size-[11px] shrink-0 text-pen-subtle"
                aria-label="Customer replies"
              />
              <span className="font-sans text-[11.5px] text-pen-subtle">
                {initialCard.messages}
              </span>
            </>
          )}
          <span className="w-1.5" />
          <div className="flex items-center -space-x-1">
            <UserAvatar
              name={initialCard.creatorName}
              avatarUrl={initialCard.creatorAvatarUrl}
              userId={initialCard.creatorId}
              size={18}
              className="ring-1 ring-pen-card"
              meta={{}}
            />
          </div>
        </div>

        {(initialCard.labels.length > 0 || (initialCard.lastMessageDirection && !initialCard.isComplete)) && (
          <div className="flex flex-wrap gap-1">
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
              <span className="font-mono text-[11.5px] font-medium text-pen-muted">
                {initialCard.startDate}
              </span>
              <span className="font-mono text-[11.5px] text-pen-subtle">→</span>
            </>
          )}
          <span
            className={cn(
              "font-mono text-[11.5px] font-medium",
              initialCard.due === "Complete"
                ? "text-pen-green"
                : initialCard.dueOverdue
                  ? "text-pen-red"
                  : initialCard.dueUrgent
                    ? "text-amber-500"
                    : initialCard.due
                      ? "text-pen-muted"
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
          <span
            className={cn(
              "font-mono text-[11.5px]",
              isRunning ? "font-semibold text-pen-green" : "text-pen-subtle",
            )}
          >
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
            <ChevronRight
              className={cn(
                "size-[11px] shrink-0 transition-transform",
                expanded && "rotate-90",
              )}
            />
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
          {subTicketCards.map((sub) => (
            <SubTicketRow key={sub.dbId} sub={sub} />
          ))}
        </div>
      )}

      {/* Sub-ticket creation modal */}
      {creatingSubTicket && (
        <NewTicketModal
          projects={[{ id: initialCard.projectId, name: initialCard.project }]}
          teamMembers={teamMembers}
          teamMembersForCreate={teamMembers}
          membersLoading={membersLoading}
          defaultProjectId={initialCard.projectId}
          defaultProjectName={initialCard.project}
          defaultTeamId={initialCard.teamId}
          statuses={statuses}
          parentId={initialCard.dbId}
          parentHumanId={initialCard.humanId}
          onCreated={onSubTicketCreated}
          onClose={closeSubTicketModal}
        />
      )}
    </div>
    </BoardCardContextMenu>
  );
}

// ── Column ─────────────────────────────────────────────────────────────────────

function BoardColumn({
  status,
  cards,
  onDrop,
  onAdd,
  membersForCreate,
  membersLoading,
}: {
  status: TeamStatusConfig;
  cards: BoardCardData[];
  onDrop: (dbId: string, toStatus: string) => void;
  onAdd?: (statusLabel: string) => void;
  membersForCreate: UserListPerson[];
  membersLoading: boolean;
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
  const badgeBg = `${status.color}1a`;

  return (
    <div
      ref={dropRef as unknown as React.Ref<HTMLDivElement>}
      className={cn(
        "flex h-full w-[320px] shrink-0 flex-col gap-2 rounded-[10px] bg-pen-surface p-3 transition-colors",
        isActive && "ring-2 ring-inset",
      )}
      style={
        isActive
          ? ({ "--tw-ring-color": status.color } as React.CSSProperties)
          : undefined
      }
    >
      <div className="flex h-6 shrink-0 items-center gap-2">
        <span
          className="block size-[7px] shrink-0 rounded-full"
          style={{ backgroundColor: status.color }}
        />
        <span className="font-sans text-[12px] font-semibold text-pen-foreground">
          {status.label}
        </span>
        <span
          className="flex items-center justify-center rounded-full px-[7px] py-px font-sans text-[11.5px] font-medium"
          style={{ backgroundColor: badgeBg, color: status.color }}
        >
          {cards.length}
        </span>
        <span className="flex-1" />
        {onAdd && (
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

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {cards.map((card) => (
          <BoardCard
            key={card.dbId}
            card={card}
            membersForCreate={membersForCreate}
            membersLoading={membersLoading}
          />
        ))}
        {cards.length === 0 && (
          <p
            className={cn(
              "py-3 text-center font-sans text-[11.5px] transition-colors",
              isActive ? "text-pen-blue" : "text-pen-subtle",
            )}
          >
            {isActive ? "Drop here" : "No tickets"}
          </p>
        )}
        {onAdd && (
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

// ── Main ───────────────────────────────────────────────────────────────────────

type Props = {
  cards: BoardCardData[];
  teamBoardGroups: TeamBoardGroup[];
  defaultTeamId?: string | null;
};

export function BoardPage({
  cards: initialCards,
  teamBoardGroups,
  defaultTeamId,
}: Props) {
  const currentUser = useCurrentUser();
  const currentUserId = currentUser?.id ?? "";
  const currentUserName = currentUser?.name ?? "";
  const canFilterByAssignee =
    currentUser?.role === "admin" ||
    currentUser?.role === "manager" ||
    currentUser?.role === "lead" ||
    currentUser?.role === "staff";
  const queryClient = useQueryClient();
  const [localCards, setLocalCards] = useState<BoardCardData[]>(initialCards);
  const timerTicketDbId = useTimerStore((s) => s.ticketDbId);
  const timerEntryId = useTimerStore((s) => s.entryId);
  const { stopTimer: stopTimerOnMove } = useTimerActions();

  // Sync server-pushed updates (router.refresh() from realtime) into local state.
  // MyTasksPage has this; BoardPage was missing it — causing the board to be
  // deaf to realtime ticket changes from other users.
  useEffect(() => {
    setLocalCards(initialCards);
  }, [initialCards]);

  const {
    assigneeFilter,
    setAssigneeFilter,
    projectFilter,
    setProjectFilter,
    moduleFilter,
    setModuleFilter,
    priorityFilter,
    setPriorityFilter,
    dateFilter,
    setDateFilter,
    intakeFilter,
    setIntakeFilter,
    labelFilter,
    setLabelFilter,
    dueRange,
    setDueRange,
    targetDateFilter,
    setTargetDateFilter,
    targetRange,
    setTargetRange,
    sortKey,
    setSortKey,
    clearFilters,
    ready: filtersReady,
  } = usePersistedBoardFilters();

  const [activeTeamId, setActiveTeamId] = useState(() => {
    if (
      defaultTeamId &&
      teamBoardGroups.some((g) => g.teamId === defaultTeamId)
    )
      return defaultTeamId;
    return teamBoardGroups[0]?.teamId ?? "";
  });
  const [createForStatus, setCreateForStatus] = useState<string | null>(null);

  // Horizontal drag-to-scroll for the board container
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const dragScrollState = useRef({ dragging: false, startX: 0, scrollLeft: 0 });
  function handleBoardMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    // Only drag on the container background, not on cards
    if ((e.target as HTMLElement).closest(".board-card")) return;
    const el = boardScrollRef.current;
    if (!el) return;
    dragScrollState.current = {
      dragging: true,
      startX: e.pageX - el.offsetLeft,
      scrollLeft: el.scrollLeft,
    };
    const onMove = (ev: MouseEvent) => {
      if (!dragScrollState.current.dragging) return;
      const x = ev.pageX - el.offsetLeft;
      el.scrollLeft =
        dragScrollState.current.scrollLeft -
        (x - dragScrollState.current.startX);
    };
    const onUp = () => {
      dragScrollState.current.dragging = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const boardTeamIds = useMemo(
    () => teamBoardGroups.map((group) => group.teamId),
    [teamBoardGroups],
  );

  const liveTeamStatusQueries = useQueries({
    queries: boardTeamIds.map((teamId) => ({
      queryKey: teamKeys.statuses(teamId),
      queryFn: () => getTeamStatuses(teamId),
      staleTime: 5 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
      refetchOnWindowFocus: false,
    })),
  });

  const teamStatusesByTeamId = useMemo(() => {
    const map = new Map<string, TeamStatusConfig[]>();
    boardTeamIds.forEach((teamId, index) => {
      const live = liveTeamStatusQueries[index]?.data;
      const fallback = teamBoardGroups.find((group) => group.teamId === teamId)?.statuses;
      if (live?.length) map.set(teamId, live);
      else if (fallback?.length) map.set(teamId, fallback);
    });
    return map;
  }, [boardTeamIds, liveTeamStatusQueries, teamBoardGroups]);

  // Merged group for department overview — unique statuses across all teams in order
  const allTeamsMergedGroup = useMemo(() => {
    if (teamBoardGroups.length <= 1) return null;
    const seen = new Set<string>();
    const mergedStatuses: TeamStatusConfig[] = [];
    for (const teamId of boardTeamIds) {
      for (const status of teamStatusesByTeamId.get(teamId) ?? []) {
        if (!seen.has(status.label)) {
          seen.add(status.label);
          mergedStatuses.push(status);
        }
      }
    }
    return {
      teamId: "all",
      teamName: "All teams",
      cards: [],
      statuses: mergedStatuses,
    };
  }, [teamBoardGroups.length, boardTeamIds, teamStatusesByTeamId]);

  const activeGroup = useMemo(
    () =>
      activeTeamId === "all"
        ? allTeamsMergedGroup
        : (teamBoardGroups.find((g) => g.teamId === activeTeamId) ??
          teamBoardGroups[0]),
    [teamBoardGroups, activeTeamId, allTeamsMergedGroup],
  );
  const fallbackStatuses = activeGroup?.statuses ?? DEFAULT_STATUSES;

  const effectiveStatuses = useMemo(() => {
    if (activeTeamId === "all") {
      return allTeamsMergedGroup?.statuses.length
        ? allTeamsMergedGroup.statuses
        : fallbackStatuses;
    }
    const live = teamStatusesByTeamId.get(activeTeamId);
    return live?.length ? live : fallbackStatuses;
  }, [
    activeTeamId,
    allTeamsMergedGroup,
    teamStatusesByTeamId,
    fallbackStatuses,
  ]);

  const resolveStatusesForCard = useCallback(
    (teamId: string) => teamStatusesByTeamId.get(teamId) ?? effectiveStatuses,
    [teamStatusesByTeamId, effectiveStatuses],
  );
  const { activeDeptId } = useDashboardContext();
  const { data: tasksMeta, isPending: membersLoading } = useTasksMeta(true, activeDeptId);
  const teamMembersForCreate = tasksMeta?.availableMembers ?? [];

  const teamProjects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of localCards) {
      if (c.teamId !== activeTeamId || !c.projectId || !c.project) continue;
      if (c.projectKind === "support") continue;
      seen.set(c.projectId, c.project);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [localCards, activeTeamId]);

  // Drop stale project filters that don't apply to the active team
  useEffect(() => {
    if (!filtersReady) return;
    if (
      projectFilter !== "all" &&
      !teamProjects.some((p) => p.id === projectFilter)
    ) {
      setProjectFilter("all");
    }
  }, [filtersReady, teamProjects, projectFilter, setProjectFilter]);

  const handleCreated = useCallback(
    (ticket: {
      id: string;
      title: string;
      status: string;
      priority: string;
      teamPrefix: string;
      ticketNumber: number;
      assigneeId: string | null;
      assigneeName: string | null;
      projectId: string | null;
      projectName: string | null;
    }) => {
      const teamName = activeGroup?.teamName ?? "";
      const projectFromList = ticket.projectId
        ? teamProjects.find((p) => p.id === ticket.projectId)
        : undefined;
      const newCard: BoardCardData = {
        dbId: ticket.id,
        humanId: `${ticket.teamPrefix}-${ticket.ticketNumber}`,
        title: ticket.title,
        priority: uiPriorityFromDb(ticket.priority),
        status: ticket.status,
        team: teamName,
        teamId: activeTeamId,
        project: ticket.projectName ?? projectFromList?.name ?? "",
        projectId: ticket.projectId ?? projectFromList?.id ?? "",
        projectKind: "standard",
        projectColor: null,
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
        assigneeAvatarUrl: null,
        avatarColor: ticket.assigneeName
          ? avatarColorFor(ticket.assigneeName)
          : null,
        coAssignees: [],
        qaAssignees: [],
        creatorId: "",
        creatorName: "",
        creatorAvatarUrl: null,
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
      setCreateForStatus(null);
    },
    [activeGroup?.teamName, activeTeamId, teamProjects],
  );

  const doMove = useCallback((dbId: string, toStatus: string, chosenLabel?: string) => {
    const snapshot = localCards;
    setLocalCards((prev) =>
      prev.map((c) => {
        if (c.dbId !== dbId) return c;
        const target = resolveStatusesForCard(c.teamId).find((s) => s.label === toStatus);
        const isComplete = !!target?.isComplete || toStatus === "Live";
        return { ...c, status: toStatus, isComplete };
      }),
    );
    if (
      timerTicketDbId === dbId &&
      normalizeStatus(toStatus) !== "In Progress"
    ) {
      stopTimerOnMove(timerEntryId).catch(() => undefined);
    }
    const prevDetail = queryClient.getQueryData<TicketDetailProps>(
      ticketKeys.detail(dbId),
    );
    queryClient.setQueryData<TicketDetailProps>(
      ticketKeys.detail(dbId),
      (old) => (old ? { ...old, status: toStatus } : old),
    );
    moveTicket(dbId, { status: toStatus, chosenLabel })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ticketKeys.detail(dbId) });
      })
      .catch(() => {
        setLocalCards(snapshot);
        if (prevDetail !== undefined) {
          queryClient.setQueryData(ticketKeys.detail(dbId), prevDetail);
        }
        toast.error("Failed to move ticket", {
          description: "The card has been moved back.",
        });
      });
  }, [localCards, timerTicketDbId, timerEntryId, stopTimerOnMove, queryClient, resolveStatusesForCard]);

  const getCardTeamId = useCallback(
    (dbId: string) => localCards.find((c) => c.dbId === dbId)?.teamId,
    [localCards],
  );

  const { tryMove: moveCard, modal: labelChoiceModal } = useLinkedLabelMovePrompt({
    resolveStatusesForCard,
    getCardTeamId,
    onMove: doMove,
  });

  const scopedCards = useMemo(() => {
    let cards = localCards;
    if (activeTeamId !== "all" && activeGroup) {
      cards = cards.filter((c) => c.teamId === activeGroup.teamId);
    }
    return cards;
  }, [localCards, activeTeamId, activeGroup]);

  const people = useMemo(() => collectAssignees(scopedCards), [scopedCards]);
  const projects = useMemo(() => collectProjects(scopedCards), [scopedCards]);
  const modules = useMemo(() => collectModules(scopedCards), [scopedCards]);
  const availableLabels = useMemo(() => collectLabels(scopedCards), [scopedCards]);

  useEffect(() => {
    if (!filtersReady) return;
    if (
      moduleFilter !== "all" &&
      !modules.some((m) => m.id === moduleFilter)
    ) {
      setModuleFilter("all");
    }
  }, [filtersReady, modules, moduleFilter, setModuleFilter]);

  const assigneeCounts = useMemo(
    () => ({
      me: countAssigneeMatches(scopedCards, "me", currentUserId),
      all: scopedCards.length,
      unassigned: countAssigneeMatches(scopedCards, "unassigned", currentUserId),
    }),
    [scopedCards, currentUserId],
  );

  const filtered = useMemo(() => {
    const effectiveAssignee = canFilterByAssignee ? assigneeFilter : "me";
    const result = scopedCards.filter((c) => {
      return (
        matchesAssigneeFilter(c, effectiveAssignee, currentUserId) &&
        matchesProjectFilter(c, projectFilter) &&
        matchesModuleFilter(c, moduleFilter) &&
        matchesPriorityFilter(c, priorityFilter) &&
        matchesDateFilter(c, dateFilter) &&
        matchesDueRange(c, dueRange) &&
        matchesTargetDateFilter(c, targetDateFilter) &&
        matchesTargetDateRange(c, targetRange) &&
        matchesIntakeFilter(c, intakeFilter) &&
        matchesLabelFilter(c, labelFilter)
      );
    });
    return sortCards(result, sortKey);
  }, [
    scopedCards,
    assigneeFilter,
    projectFilter,
    moduleFilter,
    priorityFilter,
    dateFilter,
    dueRange,
    targetDateFilter,
    targetRange,
    intakeFilter,
    labelFilter,
    currentUserId,
    canFilterByAssignee,
    sortKey,
  ]);

  const hasActiveFilters =
    assigneeFilter !== "all" ||
    projectFilter !== "all" ||
    moduleFilter !== "all" ||
    priorityFilter !== "all" ||
    dateFilter !== "all" ||
    dueRange !== null ||
    targetDateFilter !== "all" ||
    targetRange !== null ||
    intakeFilter !== "all" ||
    labelFilter.length > 0;

  const defaultCreateProjectId =
    projectFilter !== "all" &&
    teamProjects.some((p) => p.id === projectFilter)
      ? projectFilter
      : undefined;

  // O(n) Map for team-count badges in the header — replaces per-team .filter() in render
  const cardCountByTeam = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of localCards) map.set(c.teamId, (map.get(c.teamId) ?? 0) + 1);
    return map;
  }, [localCards]);

  // O(1) column lookup — replaces filtered.filter(c => c.status === ...) per column in render
  const filteredByStatus = useMemo(() => {
    const map = new Map<string, BoardCardData[]>();
    for (const c of filtered) {
      const arr = map.get(c.status);
      if (arr) arr.push(c);
      else map.set(c.status, [c]);
    }
    return map;
  }, [filtered]);

  return (
    <BoardDndProvider>
      {createForStatus && activeTeamId && activeTeamId !== "all" && (
        <NewTicketModal
          projects={teamProjects}
          teamMembers={teamMembersForCreate}
          defaultTeamId={activeTeamId}
          defaultStatus={createForStatus}
          defaultProjectId={defaultCreateProjectId}
          lockProject={false}
          statuses={effectiveStatuses}
          teamMembersForCreate={teamMembersForCreate}
          membersLoading={membersLoading}
          onCreated={handleCreated}
          onClose={() => setCreateForStatus(null)}
        />
      )}
      {labelChoiceModal}

      <div className="flex h-full flex-col">
        <div className="shrink-0 px-4 pt-2 pb-2 sm:px-6 xl:px-8">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-3">
            <div className="flex shrink-0 items-center gap-2">
              <SquareKanban
                className="size-[18px] shrink-0 text-pen-blue sm:size-5"
                strokeWidth={1.8}
              />
              <h1 className="pen-text-page-title leading-none">Board</h1>
              <span className="rounded-full bg-pen-blue-tint px-1.5 py-px font-sans text-[11.5px] font-semibold text-pen-foreground sm:px-2 sm:py-0.5">
                {filtered.length}
                {hasActiveFilters && filtered.length !== scopedCards.length && (
                  <span className="text-pen-subtle">/{scopedCards.length}</span>
                )}
              </span>
            </div>

            <span
              className="hidden h-4 w-px shrink-0 bg-pen-card-border md:block"
              aria-hidden
            />

            {/* Avoid .pen-header-scroll — its negative margins overlap trailing controls when zoomed. */}
            <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <BoardFilterBar
                view="board"
                isPrivileged={canFilterByAssignee}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
                assigneeFilter={assigneeFilter}
                onAssigneeFilterChange={setAssigneeFilter}
                people={people}
                projects={projects}
                projectFilter={projectFilter}
                onProjectFilterChange={setProjectFilter}
                modules={modules}
                moduleFilter={moduleFilter}
                onModuleFilterChange={setModuleFilter}
                teamBoardGroups={teamBoardGroups}
                activeTeamId={activeTeamId}
                onTeamChange={setActiveTeamId}
                listTeamFilter="all"
                onListTeamFilterChange={() => {}}
                cardCountByTeam={cardCountByTeam}
                priorityFilter={priorityFilter}
                onPriorityFilterChange={setPriorityFilter}
                dateFilter={dateFilter}
                onDateFilterChange={setDateFilter}
                dueRange={dueRange}
                onDueRangeChange={setDueRange}
                targetDateFilter={targetDateFilter}
                onTargetDateFilterChange={setTargetDateFilter}
                targetRange={targetRange}
                onTargetRangeChange={setTargetRange}
                intakeFilter={intakeFilter}
                onIntakeFilterChange={setIntakeFilter}
                labelFilter={labelFilter}
                onLabelFilterChange={setLabelFilter}
                availableLabels={availableLabels}
                hasActiveFilters={hasActiveFilters}
                onClearFilters={clearFilters}
                assigneeCounts={assigneeCounts}
                className="w-max"
              />
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
              <SortDropdown
                value={sortKey}
                onChange={(v) => setSortKey(v as SortKey)}
              />

              <div className="flex h-7 shrink-0 overflow-hidden rounded-md border border-pen-card-border bg-pen-card">
                <button
                  type="button"
                  onClick={() =>
                    boardScrollRef.current?.scrollBy({
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
                    boardScrollRef.current?.scrollBy({
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
            </div>
          </div>
        </div>

        {/* Content */}
        <div
          ref={boardScrollRef}
          onMouseDown={handleBoardMouseDown}
          className="min-h-0 flex-1 cursor-grab overflow-x-auto px-3 pb-4 active:cursor-grabbing [-webkit-overflow-scrolling:touch] select-none"
        >
          <div
            className="flex h-full items-stretch gap-3 sm:gap-3.5"
            style={{ width: "max-content" }}
          >
            {effectiveStatuses.map((status) => (
              <BoardColumn
                key={status.id}
                status={status}
                cards={filteredByStatus.get(status.label) ?? []}
                onDrop={moveCard}
                onAdd={activeTeamId === "all" ? undefined : setCreateForStatus}
                membersForCreate={teamMembersForCreate}
                membersLoading={membersLoading}
              />
            ))}
          </div>
        </div>
      </div>
    </BoardDndProvider>
  );
}
