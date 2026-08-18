"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { addDays, format, startOfDay, parseISO } from "date-fns";
import { dueHasTime, formatTimeHM } from "@/lib/ticket-datetime";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Users,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { AvatarVisual } from "@/components/ui/user-avatar";
import { ProjectAvatar } from "@/components/projects/project-avatar";
import { DrawerLink } from "@/components/tickets/drawer-link";
import { useCurrentUser } from "@/hooks/use-current-user";
import { updateTicket } from "@/lib/api/tickets";
import { patchTicketDetailDatesInCache } from "@/lib/ticket-detail-cache";
import { canEditTicket } from "@/lib/ticket-date-permissions";
import { toast } from "sonner";
import {
  type BoardCardData,
  type SubDepartmentBoardGroup,
  UI_PRIORITY_DOT_HEX,
  normalizeStatus,
  statusDotColor,
} from "@/components/board/board-types";
import { PriorityDot } from "@/components/board/priority-indicator";
import {
  ASSIGNEE_COL_WIDTH,
  ASSIGNEE_EXPANDED_WIDTH,
  PROJECT_COL_WIDTH,
  PROJECT_ROW_MIN_HEIGHT,
  TIMELINE_BOTTOM_PAD,
  BAR_HEIGHT,
  SUB_BAR_HEIGHT,
  ZOOM_DAY_WIDTH,
  barTopY,
  buildDayHeaders,
  buildParentChildLinks,
  collectTimelineTasks,
  computeBarPositions,
  computeTimelineBounds,
  groupByAssignee,
  groupByProject,
  layoutTaskLanes,
  positionForDate,
  resizeRangeEnd,
  resizeRangeStart,
  timelineRowHeight,
  shiftRange,
  toIso,
  totalTimelineBodyHeight,
  widthForRange,
  type AssigneeRow,
  type TaskDateRange,
  type TimelineTask,
  type TimelineZoom,
} from "@/lib/timeline-utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  cards: BoardCardData[];
  subDepartmentBoardGroups: SubDepartmentBoardGroup[];
};

type TimelineGroupMode = "assignee" | "project";

type DragState = {
  taskId: string;
  mode: "move" | "resize-start" | "resize-end";
  originX: number;
  initialRange: TaskDateRange;
};

const DATE_SAVE_DEBOUNCE_MS = 450;

type PendingDateSave = {
  range: TaskDateRange;
  rollback: TaskDateRange;
};

function renderRowIcon(row: AssigneeRow, isUnassigned: boolean) {
  if (row.projectColor !== undefined) {
    return (
      <ProjectAvatar
        name={row.name}
        color={row.projectColor ?? "#0a76b9"}
        avatarUrl={row.projectAvatarUrl}
        size={28}
      />
    );
  }
  if (isUnassigned) {
    return (
      <div className="flex size-7 items-center justify-center rounded-full border border-dashed border-pen-subtle bg-pen-surface">
        <span className="font-sans text-[9px] text-pen-subtle">?</span>
      </div>
    );
  }
  return <AvatarVisual name={row.name} avatarUrl={row.avatarUrl} size={28} />;
}

function TimelineRowCell({
  row,
  rowH,
  scrollEpoch,
  groupMode,
}: {
  row: AssigneeRow;
  rowH: number;
  scrollEpoch: number;
  groupMode: TimelineGroupMode;
}) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  const isUnassigned = row.id === "__unassigned__";
  const isNoProject = row.id === "__no_project__";
  const taskLabel = `${row.tasks.length} scheduled task${row.tasks.length === 1 ? "" : "s"}`;
  const displayName =
    groupMode === "project"
      ? isNoProject
        ? "No project"
        : row.name
      : isUnassigned
        ? "Unassigned"
        : row.name;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setPanelPos(null);
  }, [scrollEpoch]);

  const showPanel = useCallback(() => {
    clearTimeout(hideTimer.current);
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
    const PANEL_W = ASSIGNEE_EXPANDED_WIDTH;
    let left = rect.left / zoom;
    if (left + PANEL_W > document.body.offsetWidth - 8) {
      left = Math.max(8, rect.right / zoom - PANEL_W);
    }
    setPanelPos({ top: rect.top / zoom, left });
  }, []);

  const hidePanel = useCallback(() => {
    hideTimer.current = setTimeout(() => setPanelPos(null), 120);
  }, []);

  const cancelHide = useCallback(() => {
    clearTimeout(hideTimer.current);
  }, []);

  if (groupMode === "project") {
    return (
      <div
        className="flex shrink-0 items-center gap-2 overflow-hidden border-b border-pen-card-border/80 px-2.5 transition-colors hover:bg-pen-surface/30"
        style={{ height: rowH, minHeight: rowH }}
        title={displayName}
      >
        <div className="shrink-0">{renderRowIcon(row, isUnassigned)}</div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-sans text-[12px] font-semibold leading-snug text-pen-foreground">
            {displayName}
          </p>
          {row.subDepartmentLabel && (
            <p className="mt-0.5 truncate font-sans text-[11px] leading-snug text-pen-subtle">
              {row.subDepartmentLabel}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        ref={triggerRef}
        className="flex shrink-0 items-center justify-center border-b border-pen-card-border/80 transition-colors hover:bg-pen-surface/30"
        style={{ height: rowH, minHeight: rowH }}
        onMouseEnter={showPanel}
        onMouseLeave={hidePanel}
      >
        {renderRowIcon(row, isUnassigned)}
      </div>

      {mounted && panelPos && createPortal(
        <div
          onMouseEnter={cancelHide}
          onMouseLeave={hidePanel}
          style={{
            position: "fixed",
            top: panelPos.top,
            left: panelPos.left,
            height: rowH,
            width: ASSIGNEE_EXPANDED_WIDTH,
            zIndex: 9999,
          }}
          className="flex items-center gap-2.5 overflow-hidden border border-pen-card-border bg-pen-card pl-2 pr-3 shadow-pen-card"
        >
          <div className="flex w-[28px] shrink-0 items-center justify-center">
            {renderRowIcon(row, isUnassigned)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-sans text-[12.5px] font-semibold leading-tight text-pen-foreground">
              {displayName}
            </p>
            {row.subDepartmentLabel && (
              <p className="truncate font-sans text-[11.5px] leading-tight text-pen-subtle">
                {row.subDepartmentLabel}
              </p>
            )}
            <p className="truncate font-sans text-[11.5px] leading-tight text-pen-muted">
              {taskLabel}
            </p>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Timeline bar ──────────────────────────────────────────────────────────────

function formatTimelineRange(range: TaskDateRange, task?: TimelineTask): string {
  const endT =
    task?.dueDateIso && dueHasTime(parseISO(task.dueDateIso))
      ? formatTimeHM(parseISO(task.dueDateIso))
      : "";
  const start = format(range.start, "d MMM");
  const end = `${format(range.end, "d MMM yyyy")}${endT ? ` ${endT}` : ""}`;
  if (range.start.getTime() === range.end.getTime() && !endT) {
    return format(range.start, "d MMM yyyy");
  }
  return `${start} – ${end}`;
}

function capitalizeLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function TimelineBarHoverCard({
  task,
  range,
  statusColor,
  priorityColor,
  anchorRect,
  onMouseEnter,
  onMouseLeave,
}: {
  task: TimelineTask;
  range: TaskDateRange;
  statusColor: string;
  priorityColor: string;
  anchorRect: DOMRect;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
  const top = (anchorRect.top - 6) / zoom;
  const left = (anchorRect.left + anchorRect.width / 2) / zoom;

  return createPortal(
    <div
      style={{
        position: "fixed",
        top,
        left,
        transform: "translate(-50%, -100%)",
        zIndex: 10000,
      }}
      className="pointer-events-auto w-[min(288px,calc(100vw-24px))] rounded-lg border border-pen-card-border bg-pen-card p-3 shadow-pen-card"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-1.5 block size-2 shrink-0 rounded-full"
          style={{ backgroundColor: priorityColor }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-mono text-[12px] font-semibold text-pen-id">
              {task.humanId}
            </span>
            {task.isSubTicket && task.parentHumanId && (
              <span className="font-mono text-[10px] text-pen-subtle">
                ↳ {task.parentHumanId}
              </span>
            )}
          </div>
          <p className="mt-0.5 font-sans text-[13px] font-semibold leading-snug text-pen-foreground">
            {task.title}
          </p>
        </div>
      </div>
      <div className="mt-2.5 space-y-1 font-sans text-[11.5px] leading-snug text-pen-muted">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="inline-block size-2 shrink-0 rounded-full"
            style={{ backgroundColor: statusColor }}
          />
          <span>{task.status}</span>
          <span className="text-pen-subtle">·</span>
          <span>{capitalizeLabel(task.priority)}</span>
        </div>
        {task.assigneeName ? <p>Assignee: {task.assigneeName}</p> : null}
        {task.project ? <p>Project: {task.project}</p> : null}
        <p>{formatTimelineRange(range, task)}</p>
      </div>
    </div>,
    document.body,
  );
}

function TimelineBar({
  task,
  boundsStart,
  top,
  dayWidth,
  colorMap,
  canEdit,
  onRangePreview,
  onRangeCommit,
}: {
  task: TimelineTask;
  boundsStart: Date;
  top: number;
  dayWidth: number;
  colorMap: Record<string, string>;
  canEdit: boolean;
  onRangePreview: (range: TaskDateRange) => void;
  onRangeCommit: (
    taskId: string,
    range: TaskDateRange,
    rollback: TaskDateRange,
  ) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [dragging, setDragging] = useState(false);
  const [previewRange, setPreviewRange] = useState<TaskDateRange | null>(null);
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);
  const didDragRef = useRef(false);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const hideHoverCard = useCallback(() => {
    hideTimer.current = setTimeout(() => setHoverRect(null), 120);
  }, []);

  const cancelHideHoverCard = useCallback(() => {
    clearTimeout(hideTimer.current);
  }, []);

  const showHoverCard = useCallback(() => {
    if (dragRef.current || dragging) return;
    cancelHideHoverCard();
    const rect = barRef.current?.getBoundingClientRect();
    if (rect) setHoverRect(rect);
  }, [cancelHideHoverCard, dragging]);

  const range = previewRange ?? task.range;
  const barH = task.isSubTicket ? SUB_BAR_HEIGHT : BAR_HEIGHT;
  const left = positionForDate(range.start, boundsStart, dayWidth) + 2;
  const barWidth = widthForRange(range, dayWidth);
  const displayWidth = Math.max(barWidth, task.isSubTicket ? 28 : 34);
  const isCompact = displayWidth < 88;

  const statusColor = colorMap[task.status] ?? statusDotColor(task.status);
  const priorityColor = UI_PRIORITY_DOT_HEX[task.priority];

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, mode: DragState["mode"]) => {
      if (!canEdit) return;
      if (e.button !== 0) return;
      setHoverRect(null);
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        taskId: task.dbId,
        mode,
        originX: e.clientX,
        initialRange: { ...task.range },
      };
      didDragRef.current = false;
      setDragging(true);
    },
    [canEdit, task.dbId, task.range],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!canEdit) return;
      const drag = dragRef.current;
      if (!drag) return;
      const deltaPx = e.clientX - drag.originX;
      if (Math.abs(deltaPx) > 3) didDragRef.current = true;
      const deltaDays = Math.round(deltaPx / dayWidth);
      let nextRange: TaskDateRange;

      if (drag.mode === "move") {
        nextRange = shiftRange(drag.initialRange, deltaDays);
      } else if (drag.mode === "resize-start") {
        nextRange = resizeRangeStart(
          drag.initialRange,
          addDays(drag.initialRange.start, deltaDays),
        );
      } else {
        nextRange = resizeRangeEnd(
          drag.initialRange,
          addDays(drag.initialRange.end, deltaDays),
        );
      }

      setPreviewRange(nextRange);
      onRangePreview(nextRange);
    },
    [canEdit, dayWidth, onRangePreview],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      dragRef.current = null;
      setDragging(false);

      const finalRange = previewRange ?? task.range;
      const hadPreview = previewRange !== null;
      setPreviewRange(null);

      if (
        finalRange.start.getTime() === task.range.start.getTime() &&
        finalRange.end.getTime() === task.range.end.getTime()
      ) {
        if (hadPreview) onRangePreview(task.range);
        return;
      }

      onRangeCommit(task.dbId, finalRange, task.range);
    },
    [onRangeCommit, onRangePreview, previewRange, task.dbId, task.range],
  );

  return (
    <>
    <div
      ref={barRef}
      data-timeline-bar
      className={cn(
        "group/bar absolute z-[5] flex min-w-[34px] items-center overflow-hidden rounded-md border shadow-sm transition-shadow",
        task.isSubTicket ? "border-dashed" : "border-solid",
        canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        dragging
          ? "z-20 shadow-lg ring-2 ring-pen-blue/40"
          : canEdit
            ? "hover:z-10 hover:shadow-md"
            : "opacity-90",
      )}
      style={{
        left,
        width: displayWidth,
        top,
        height: barH,
        borderColor: `${statusColor}${task.isSubTicket ? "66" : "55"}`,
        background: task.isSubTicket
          ? `linear-gradient(135deg, ${statusColor}12 0%, ${statusColor}28 100%)`
          : `linear-gradient(135deg, ${statusColor}22 0%, ${statusColor}38 100%)`,
      }}
      onMouseEnter={showHoverCard}
      onMouseLeave={hideHoverCard}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Resize handle — start */}
      {canEdit && (
        <div
          className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize opacity-0 transition-opacity group-hover/bar:opacity-100"
          style={{
            background: `linear-gradient(90deg, ${statusColor}88, transparent)`,
          }}
          onPointerDown={(e) => handlePointerDown(e, "resize-start")}
        />
      )}

      {/* Drag body / click target */}
      <div
        className="flex min-w-0 flex-1 items-center"
        onPointerDown={
          canEdit ? (e) => handlePointerDown(e, "move") : undefined
        }
        onClickCapture={(e) => {
          if (didDragRef.current) {
            e.preventDefault();
            e.stopPropagation();
            didDragRef.current = false;
          }
        }}
      >
        <DrawerLink
          ticketId={task.dbId}
          href={`/tickets/${task.dbId}`}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 px-2 py-0",
            isCompact && "justify-center px-0",
          )}
        >
          <span
            className="block size-[6px] shrink-0 rounded-full"
            style={{ backgroundColor: priorityColor }}
          />
          {task.isSubTicket && task.parentHumanId && !isCompact && (
            <span className="shrink-0 font-mono text-[9px] font-medium text-pen-subtle">
              ↳{task.parentHumanId}
            </span>
          )}
          {!isCompact && (
            <span className="truncate font-mono text-[11.5px] font-semibold text-pen-id/80">
              {task.humanId}
            </span>
          )}
          {!isCompact && (
            <span
              className={cn(
                "min-w-0 flex-1 truncate font-sans font-semibold text-pen-foreground",
                task.isSubTicket ? "text-[11.5px]" : "text-[12px]",
              )}
            >
              {task.title}
            </span>
          )}
        </DrawerLink>
      </div>

      {/* Resize handle — end */}
      {canEdit && (
        <div
          className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize opacity-0 transition-opacity group-hover/bar:opacity-100"
          style={{
            background: `linear-gradient(270deg, ${statusColor}88, transparent)`,
          }}
          onPointerDown={(e) => handlePointerDown(e, "resize-end")}
        />
      )}
    </div>

    {mounted && hoverRect && !dragging && (
      <TimelineBarHoverCard
        task={task}
        range={range}
        statusColor={statusColor}
        priorityColor={priorityColor}
        anchorRect={hoverRect}
        onMouseEnter={cancelHideHoverCard}
        onMouseLeave={hideHoverCard}
      />
    )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function TimelineViewPage({ cards, subDepartmentBoardGroups }: Props) {
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const assigneeScrollRef = useRef<HTMLDivElement>(null);
  const didInitialScroll = useRef(false);
  const syncingScroll = useRef(false);
  const panRef = useRef<{ x: number; scrollLeft: number } | null>(null);
  const zoomAnchorDateRef = useRef<Date | null>(null);
  const pendingDateSaves = useRef<Map<string, PendingDateSave>>(new Map());
  const dateSaveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const [zoom, setZoom] = useState<TimelineZoom>("month");
  const [activeFilter, setActiveFilter] = useState<"all" | "me">("all");
  const [groupMode, setGroupMode] = useState<TimelineGroupMode>("project");
  const [localRanges, setLocalRanges] = useState<Map<string, TaskDateRange>>(
    new Map(),
  );
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [assigneeScrollEpoch, setAssigneeScrollEpoch] = useState(0);

  const dayWidth = ZOOM_DAY_WIDTH[zoom];
  const headerHeight = zoom === "quarter" ? 52 : 58;
  const labelColWidth =
    groupMode === "project" ? PROJECT_COL_WIDTH : ASSIGNEE_COL_WIDTH;
  const rowMinHeight =
    groupMode === "project" ? PROJECT_ROW_MIN_HEIGHT : 0;

  const statusColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const group of subDepartmentBoardGroups) {
      for (const s of group.statuses) {
        map[s.label] = s.color;
        map[normalizeStatus(s.label)] = s.color;
      }
    }
    return map;
  }, [subDepartmentBoardGroups]);

  const scheduledTasks = useMemo(() => {
    const all = collectTimelineTasks(cards, localRanges);
    if (activeFilter === "me" && currentUser?.id) {
      return all.filter(
        (t) =>
          t.assigneeId === currentUser.id ||
          t.coAssignees.some((a) => a.id === currentUser.id),
      );
    }
    return all;
  }, [cards, activeFilter, currentUser?.id, localRanges]);

  const subTicketCount = useMemo(
    () => scheduledTasks.filter((t) => t.isSubTicket).length,
    [scheduledTasks],
  );

  const timelineRows = useMemo(
    () =>
      groupMode === "project"
        ? groupByProject(scheduledTasks)
        : groupByAssignee(scheduledTasks),
    [groupMode, scheduledTasks],
  );

  const bounds = useMemo(
    () => computeTimelineBounds(scheduledTasks),
    [scheduledTasks],
  );

  const barPositions = useMemo(
    () =>
      computeBarPositions(
        timelineRows,
        bounds.start,
        dayWidth,
        headerHeight,
        rowMinHeight,
      ),
    [timelineRows, bounds.start, dayWidth, headerHeight, rowMinHeight],
  );

  const relationLinks = useMemo(
    () => buildParentChildLinks(scheduledTasks, barPositions),
    [scheduledTasks, barPositions],
  );

  const bodyHeight = useMemo(
    () =>
      totalTimelineBodyHeight(
        timelineRows,
        headerHeight,
        rowMinHeight,
        TIMELINE_BOTTOM_PAD,
      ),
    [timelineRows, headerHeight, rowMinHeight],
  );

  const dayHeaders = useMemo(
    () => buildDayHeaders(bounds.start, bounds.end, zoom),
    [bounds.start, bounds.end, zoom],
  );

  const totalWidth = dayHeaders.length * dayWidth;
  const todayOffset = positionForDate(
    startOfDay(new Date()),
    bounds.start,
    dayWidth,
  );

  const unscheduledCount = useMemo(() => {
    let count = 0;
    for (const card of cards) {
      if (!card.startDateIso && !card.dueDateIso) count++;
      for (const sub of card.subTicketCards) {
        if (!sub.startDateIso && !sub.dueDateIso) count++;
      }
    }
    return count;
  }, [cards]);

  const handleRangeChange = useCallback(
    (taskId: string, range: TaskDateRange) => {
      setLocalRanges((prev) => new Map(prev).set(taskId, range));
    },
    [],
  );

  const syncTicketDetailDates = useCallback(
    (taskId: string, range: TaskDateRange) => {
      patchTicketDetailDatesInCache(
        queryClient,
        taskId,
        toIso(range.start),
        toIso(range.end),
      );
    },
    [queryClient],
  );

  const canEditTaskDates = useCallback(
    (task: BoardCardData) => {
      if (!currentUser) return false;
      return canEditTicket(currentUser, {
        assigneeId: task.assigneeId,
        creatorId: task.creatorId,
        coAssigneeIds: task.coAssignees.map((a) => a.id),
        subDepartmentId: task.subDepartmentId,
      });
    },
    [currentUser],
  );

  const flushDateSave = useCallback(
    async (taskId: string) => {
      const pending = pendingDateSaves.current.get(taskId);
      if (!pending) return;

      pendingDateSaves.current.delete(taskId);
      dateSaveTimers.current.delete(taskId);

      try {
        await updateTicket(taskId, {
          startDate: toIso(pending.range.start),
          dueDate: toIso(pending.range.end),
        });
      } catch {
        setLocalRanges((prev) => {
          const next = new Map(prev);
          next.set(taskId, pending.rollback);
          return next;
        });
        syncTicketDetailDates(taskId, pending.rollback);
        toast.error("Failed to update dates");
      }
    },
    [syncTicketDetailDates],
  );

  const scheduleDebouncedDateSave = useCallback(
    (taskId: string, range: TaskDateRange, rollback: TaskDateRange) => {
      handleRangeChange(taskId, range);
      syncTicketDetailDates(taskId, range);

      const existing = pendingDateSaves.current.get(taskId);
      pendingDateSaves.current.set(taskId, {
        range,
        rollback: existing?.rollback ?? rollback,
      });

      const prevTimer = dateSaveTimers.current.get(taskId);
      if (prevTimer) clearTimeout(prevTimer);

      dateSaveTimers.current.set(
        taskId,
        setTimeout(() => {
          void flushDateSave(taskId);
        }, DATE_SAVE_DEBOUNCE_MS),
      );
    },
    [flushDateSave, handleRangeChange, syncTicketDetailDates],
  );

  useEffect(() => {
    return () => {
      for (const timer of dateSaveTimers.current.values()) clearTimeout(timer);
      dateSaveTimers.current.clear();
      const pendingIds = [...pendingDateSaves.current.keys()];
      for (const taskId of pendingIds) {
        void flushDateSave(taskId);
      }
    };
  }, [flushDateSave]);

  const updateScrollButtons = useCallback(() => {
    const el = timelineScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  const scrollTimelineBy = useCallback((delta: number) => {
    timelineScrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  }, []);

  const scrollToToday = useCallback(() => {
    const el = timelineScrollRef.current;
    if (!el) return;
    const target = todayOffset - el.clientWidth / 2 + dayWidth / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [todayOffset, dayWidth]);

  const handleTimelineScroll = useCallback(() => {
    updateScrollButtons();
    const timeline = timelineScrollRef.current;
    const assignee = assigneeScrollRef.current;
    if (!timeline || !assignee || syncingScroll.current) return;
    syncingScroll.current = true;
    assignee.scrollTop = timeline.scrollTop;
    syncingScroll.current = false;
    setAssigneeScrollEpoch((n) => n + 1);
  }, [updateScrollButtons]);

  const handleAssigneeScroll = useCallback(() => {
    const timeline = timelineScrollRef.current;
    const assignee = assigneeScrollRef.current;
    if (!timeline || !assignee || syncingScroll.current) return;
    syncingScroll.current = true;
    timeline.scrollTop = assignee.scrollTop;
    syncingScroll.current = false;
    updateScrollButtons();
    setAssigneeScrollEpoch((n) => n + 1);
  }, [updateScrollButtons]);

  const syncAssigneeScrollTop = useCallback((scrollTop: number) => {
    const assignee = assigneeScrollRef.current;
    if (!assignee || syncingScroll.current) return;
    syncingScroll.current = true;
    assignee.scrollTop = scrollTop;
    syncingScroll.current = false;
  }, []);

  const handlePanPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 && e.button !== 1) return;
      if ((e.target as HTMLElement).closest("[data-timeline-bar]")) return;

      const el = timelineScrollRef.current;
      if (!el) return;

      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      panRef.current = {
        x: e.clientX,
        scrollLeft: el.scrollLeft,
      };
      setIsPanning(true);
    },
    [],
  );

  const handlePanPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const pan = panRef.current;
      const el = timelineScrollRef.current;
      if (!pan || !el) return;

      el.scrollLeft = pan.scrollLeft - (e.clientX - pan.x);
      updateScrollButtons();
    },
    [updateScrollButtons],
  );

  const handlePanPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!panRef.current) return;
      timelineScrollRef.current?.releasePointerCapture(e.pointerId);
      panRef.current = null;
      setIsPanning(false);
      updateScrollButtons();
    },
    [updateScrollButtons],
  );

  useEffect(() => {
    if (didInitialScroll.current || scheduledTasks.length === 0) return;
    didInitialScroll.current = true;
    scrollToToday();
  }, [scrollToToday, scheduledTasks.length]);

  useEffect(() => {
    updateScrollButtons();
    const el = timelineScrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateScrollButtons);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateScrollButtons, totalWidth, timelineRows.length]);

  function changeZoom(delta: -1 | 1) {
    const order: TimelineZoom[] = ["quarter", "month", "week"];
    const idx = order.indexOf(zoom);
    const next = order[Math.min(order.length - 1, Math.max(0, idx + delta))];
    if (next === zoom) return;

    // Snapshot the date at the horizontal centre of the viewport so we can
    // restore it after the day-width changes.
    const el = timelineScrollRef.current;
    if (el) {
      const centerPx = el.scrollLeft + el.clientWidth / 2;
      zoomAnchorDateRef.current = addDays(bounds.start, centerPx / dayWidth);
    }

    setZoom(next);
  }

  // After a zoom change, scroll so the anchored date stays at the centre.
  useEffect(() => {
    const anchorDate = zoomAnchorDateRef.current;
    const el = timelineScrollRef.current;
    if (!anchorDate || !el) return;
    zoomAnchorDateRef.current = null;

    const anchorPx = positionForDate(anchorDate, bounds.start, dayWidth);
    el.scrollLeft = Math.max(0, anchorPx - el.clientWidth / 2);
    updateScrollButtons();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-pen-bg">
      {/* Header toolbar */}
      <div className="shrink-0 border-b border-pen-card-border bg-pen-card px-4 py-2.5 sm:px-6 xl:px-8">
        <PageHeader
          title="Timeline"
          icon={CalendarDays}
          iconClassName="text-pen-blue"
          badge={
            <span className="inline-flex items-center rounded-full bg-pen-blue-tint px-2.5 py-0.5 font-sans text-[12px] font-semibold leading-none text-pen-id">
              {scheduledTasks.length} scheduled
              {subTicketCount > 0 && (
                <span className="text-pen-subtle">
                  {" "}
                  · {subTicketCount} sub
                </span>
              )}
            </span>
          }
          titleExtra={
            unscheduledCount > 0 ? (
              <span className="font-sans text-[12px] leading-none text-pen-subtle">
                · {unscheduledCount} without dates
              </span>
            ) : undefined
          }
          actions={
            <>
              {(["assignee", "project"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setGroupMode(mode)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 font-sans text-[13px] font-medium transition-colors",
                    groupMode === mode
                      ? "border-pen-blue bg-pen-blue text-white dark:text-gray-900"
                      : "border-pen-card-border bg-pen-card text-pen-foreground hover:border-pen-muted",
                  )}
                >
                  {mode === "assignee" ? "By person" : "By project"}
                </button>
              ))}

              {(["all", "me"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setActiveFilter(f)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 font-sans text-[13px] font-medium transition-colors",
                    activeFilter === f
                      ? "border-pen-blue bg-pen-blue text-white dark:text-gray-900"
                      : "border-pen-card-border bg-pen-card text-pen-foreground hover:border-pen-muted",
                  )}
                >
                  {f === "all" ? "Everyone" : "My tasks"}
                </button>
              ))}

              <div className="flex items-center overflow-hidden rounded-lg border border-pen-card-border bg-pen-card">
                <button
                  type="button"
                  onClick={() => scrollTimelineBy(-dayWidth * 7)}
                  disabled={!canScrollLeft}
                  aria-label="Scroll timeline left"
                  className="flex size-9 items-center justify-center text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollTimelineBy(dayWidth * 7)}
                  disabled={!canScrollRight}
                  aria-label="Scroll timeline right"
                  className="flex size-9 items-center justify-center text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground disabled:opacity-40"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>

              <div className="flex items-center overflow-hidden rounded-lg border border-pen-card-border bg-pen-card">
                <button
                  type="button"
                  onClick={() => changeZoom(-1)}
                  disabled={zoom === "quarter"}
                  aria-label="Zoom out"
                  className="flex size-9 items-center justify-center text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground disabled:opacity-40"
                >
                  <ZoomOut className="size-4" />
                </button>
                <span className="border-x border-pen-card-border px-3 font-sans text-[12.5px] font-semibold capitalize text-pen-foreground">
                  {zoom}
                </span>
                <button
                  type="button"
                  onClick={() => changeZoom(1)}
                  disabled={zoom === "week"}
                  aria-label="Zoom in"
                  className="flex size-9 items-center justify-center text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground disabled:opacity-40"
                >
                  <ZoomIn className="size-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={scrollToToday}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-pen-card-border bg-pen-card px-3.5 font-sans text-[13px] font-semibold text-pen-foreground transition-colors hover:border-pen-blue hover:text-pen-id"
              >
                Today
              </button>
            </>
          }
        />
      </div>

      {/* Timeline grid */}
      {scheduledTasks.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-pen-blue-tint">
            <CalendarDays className="size-7 text-pen-blue" strokeWidth={1.5} />
          </div>
          <p className="font-sans text-[16px] font-semibold text-pen-foreground">
            No scheduled tasks yet
          </p>
          <p className="max-w-sm font-sans text-[14px] text-pen-muted">
            Add start and due dates on tickets to see them on the timeline,
            grouped by {groupMode === "project" ? "project" : "assignee"}.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="relative flex min-h-0 flex-1">
            {/* Fixed assignee column — vertical scroll only, synced with timeline */}
            <div
              className="flex shrink-0 flex-col overflow-hidden border-r border-pen-card-border bg-pen-card"
              style={{ width: labelColWidth }}
            >
              <div
                className={cn(
                  "flex shrink-0 items-center border-b border-pen-card-border",
                  groupMode === "project"
                    ? "gap-2 px-2.5"
                    : "justify-center",
                )}
                style={{ height: headerHeight }}
              >
                {groupMode === "project" ? (
                  <>
                    <FolderKanban
                      className="size-4 shrink-0 text-pen-subtle"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <span className="font-sans text-[11px] font-semibold uppercase tracking-wide text-pen-subtle">
                      Project
                    </span>
                  </>
                ) : (
                  <Users
                    className="size-4 text-pen-subtle"
                    strokeWidth={1.75}
                    aria-label="Assignee"
                  />
                )}
              </div>

              <div
                ref={assigneeScrollRef}
                onScroll={handleAssigneeScroll}
                className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-none [&::-webkit-scrollbar]:hidden"
              >
                {timelineRows.map((row) => (
                  <TimelineRowCell
                    key={row.id}
                    row={row}
                    rowH={timelineRowHeight(row.tasks, rowMinHeight)}
                    scrollEpoch={assigneeScrollEpoch}
                    groupMode={groupMode}
                  />
                ))}
                <div aria-hidden style={{ height: TIMELINE_BOTTOM_PAD }} />
              </div>
            </div>

            {/* Horizontally scrollable timeline pane */}
            <div
              ref={timelineScrollRef}
              onScroll={handleTimelineScroll}
              onPointerDown={handlePanPointerDown}
              onPointerMove={handlePanPointerMove}
              onPointerUp={handlePanPointerUp}
              onPointerCancel={handlePanPointerUp}
              className={cn(
                "min-w-0 flex-1 overflow-x-auto overflow-y-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]",
                isPanning ? "cursor-grabbing select-none" : "cursor-grab",
              )}
            >
              <div
                className="relative"
                style={{ width: totalWidth, minHeight: "100%" }}
              >
                {/* Date header — sticks to top while scrolling vertically */}
                <div
                  className="sticky top-0 z-20 flex border-b border-pen-card-border bg-pen-card/95 backdrop-blur-sm"
                  style={{ height: headerHeight, width: totalWidth }}
                >
                  {dayHeaders.map((h) => (
                    <div
                      key={h.iso}
                      className={cn(
                        "relative flex shrink-0 flex-col items-center justify-end border-r border-pen-card-border/60 pb-1",
                        h.isWeekend && "bg-pen-surface/50 dark:bg-white/[0.02]",
                        h.isToday && "bg-pen-blue-tint/60",
                      )}
                      style={{ width: dayWidth }}
                    >
                      {h.showMonth && (
                        <span className="mb-0.5 font-sans text-[9.5px] font-semibold uppercase tracking-wide text-pen-subtle">
                          {h.monthLabel}
                        </span>
                      )}
                      <span
                        className={cn(
                          "font-sans text-[9.5px] uppercase tracking-wide",
                          h.isToday
                            ? "font-semibold text-pen-blue"
                            : "text-pen-subtle",
                        )}
                      >
                        {h.weekday}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 flex size-6 items-center justify-center rounded-full font-mono text-[11.5px] font-medium",
                          h.isToday
                            ? "bg-pen-blue text-white dark:text-gray-900"
                            : "text-pen-foreground",
                        )}
                      >
                        {h.dayLabel}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Today marker */}
                <div
                  className="pointer-events-none absolute z-[15] w-px bg-pen-blue/70"
                  style={{
                    left: todayOffset + dayWidth / 2,
                    top: headerHeight,
                    height: bodyHeight - headerHeight,
                  }}
                >
                  <div className="absolute top-0 left-1/2 size-2 -translate-x-1/2 rounded-full bg-pen-blue" />
                </div>

                {/* Parent ↔ sub-ticket relation lines */}
                {relationLinks.length > 0 && (
                  <svg
                    className="pointer-events-none absolute left-0 top-0 z-[4]"
                    width={totalWidth}
                    height={bodyHeight}
                    aria-hidden
                  >
                    {relationLinks.map((link) => (
                      <g key={`${link.parentId}-${link.childId}`}>
                        <path
                          d={link.path}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          strokeLinecap="round"
                          className="text-pen-subtle/50"
                        />
                        {(() => {
                          const child = barPositions.get(link.childId);
                          if (!child) return null;
                          return (
                            <circle
                              cx={child.centerX}
                              cy={child.topY}
                              r={2.5}
                              className="fill-pen-subtle/60"
                            />
                          );
                        })()}
                      </g>
                    ))}
                  </svg>
                )}

                {/* Task rows */}
                {timelineRows.map((row) => {
                  const layout = layoutTaskLanes(row.tasks);
                  const rowH = timelineRowHeight(row.tasks, rowMinHeight);

                  return (
                    <div
                      key={row.id}
                      className="relative border-b border-pen-card-border/80 transition-colors hover:bg-pen-surface/30"
                      style={{
                        width: totalWidth,
                        height: rowH,
                        minHeight: rowH,
                      }}
                    >
                      {/* Grid background */}
                      <div className="absolute inset-0 flex">
                        {dayHeaders.map((h) => (
                          <div
                            key={h.iso}
                            className={cn(
                              "shrink-0 border-r border-pen-card-border/40",
                              h.isWeekend &&
                                "bg-pen-surface/40 dark:bg-white/[0.015]",
                              h.isToday && "bg-pen-blue/[0.04]",
                            )}
                            style={{ width: dayWidth }}
                          />
                        ))}
                      </div>

                      {row.tasks.map((task) => (
                        <TimelineBar
                          key={task.dbId}
                          task={task}
                          boundsStart={bounds.start}
                          top={barTopY(layout, task.dbId)}
                          dayWidth={dayWidth}
                          colorMap={statusColorMap}
                          canEdit={canEditTaskDates(task)}
                          onRangePreview={(range) =>
                            syncTicketDetailDates(task.dbId, range)
                          }
                          onRangeCommit={scheduleDebouncedDateSave}
                        />
                      ))}
                    </div>
                  );
                })}

                <div
                  aria-hidden
                  className="border-b border-transparent"
                  style={{ height: TIMELINE_BOTTOM_PAD }}
                />
              </div>
            </div>
          </div>

          {/* Legend footer */}
          <div className="shrink-0 border-t border-pen-card-border bg-pen-card px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] sm:px-6">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-pen-card-border bg-pen-surface/80 px-2.5 py-1 font-sans text-[11.5px] text-pen-muted">
                  <span className="block h-3 w-6 rounded-sm bg-pen-blue/20 ring-1 ring-pen-blue/30" />
                  Today
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-pen-card-border bg-pen-surface/80 px-2.5 py-1 font-sans text-[11.5px] text-pen-muted">
                  <PriorityDot priority="critical" />
                  Priority on bars
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-pen-card-border bg-pen-surface/50 px-2.5 py-1 font-sans text-[11.5px] text-pen-muted">
                  Dashed = sub-ticket
                </span>
              </div>
              <p className="font-sans text-[11.5px] text-pen-subtle">
                Drag sideways to pan dates · scroll vertically for rows
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
