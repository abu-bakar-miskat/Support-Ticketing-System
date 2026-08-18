import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  isSameDay,
  isWeekend,
  parseISO,
  startOfDay,
  startOfWeek,
} from "date-fns";
import type {
  BoardCardData,
  SubCardData,
} from "@/components/board/board-types";

export type TimelineZoom = "week" | "month" | "quarter";

export const ZOOM_DAY_WIDTH: Record<TimelineZoom, number> = {
  week: 84,
  month: 42,
  quarter: 15,
};

export const ROW_HEIGHT = 40;
export const BAR_HEIGHT = 26;
export const SUB_BAR_HEIGHT = 20;
export const ASSIGNEE_COL_WIDTH = 44;
export const ASSIGNEE_EXPANDED_WIDTH = 208;
export const PROJECT_COL_WIDTH = 208;
export const PROJECT_ROW_MIN_HEIGHT = 58;
export const TIMELINE_BOTTOM_PAD = 16;
export const LANE_PAD_TOP = 6;
export const LANE_PAD_BOTTOM = 8;
export const LANE_GAP = 4;

export type TaskDateRange = {
  start: Date;
  end: Date;
};

export type TimelineTask = BoardCardData & {
  range: TaskDateRange;
  hasExplicitDates: boolean;
  parentDbId: string | null;
  parentHumanId: string | null;
  isSubTicket: boolean;
};

export type BarPosition = {
  taskId: string;
  rowId: string;
  rowTop: number;
  lane: number;
  left: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  bottomY: number;
  topY: number;
};

export type TimelineRelation = {
  parentId: string;
  childId: string;
  path: string;
};

export type AssigneeRow = {
  id: string;
  name: string;
  subDepartmentLabel: string | null;
  avatarUrl?: string | null;
  avatarColor: string | null;
  /** When set, the row represents a project (show color swatch instead of avatar). */
  projectColor?: string | null;
  projectAvatarUrl?: string | null;
  tasks: TimelineTask[];
};

export function parseDay(iso: string): Date {
  return startOfDay(parseISO(iso));
}

export function toIso(d: Date): string {
  return format(startOfDay(d), "yyyy-MM-dd");
}

/** Resolve a task's timeline span from saved start/due dates. */
export function resolveTaskRange(task: BoardCardData): TimelineTask | null {
  const startIso = task.startDateIso;
  const dueIso = task.dueDateIso;

  if (!startIso && !dueIso) return null;

  let start: Date;
  let end: Date;

  if (startIso && dueIso) {
    start = parseDay(startIso);
    end = parseDay(dueIso);
    if (end < start) end = start;
  } else if (startIso) {
    start = parseDay(startIso);
    end = addDays(start, 2);
  } else {
    end = parseDay(dueIso!);
    start = addDays(end, -2);
  }

  return {
    ...task,
    range: { start, end },
    hasExplicitDates: !!(startIso && dueIso),
    parentDbId: null,
    parentHumanId: null,
    isSubTicket: false,
  };
}

export function subCardToBoardCard(
  sub: SubCardData,
  parent: BoardCardData,
): BoardCardData {
  return {
    dbId: sub.dbId,
    humanId: sub.humanId,
    title: sub.title,
    priority: sub.priority,
    status: sub.status,
    subDepartment: parent.subDepartment,
    subDepartmentId: parent.subDepartmentId,
    project: parent.project,
    projectId: parent.projectId,
    projectKind: parent.projectKind,
    projectColor: parent.projectColor,
    projectAvatarUrl: parent.projectAvatarUrl,
    moduleId: parent.moduleId,
    moduleName: parent.moduleName,
    labels: [],
    comments: 0,
    messages: 0,
    attachments: 0,
    subDone: 0,
    subTotal: 0,
    subTicketCards: [],
    assigneeId: sub.assigneeId,
    assigneeName: sub.assigneeName,
    avatarColor: sub.avatarColor,
    assigneeAvatarUrl: sub.assigneeAvatarUrl,
    coAssignees: [],
    qaAssignees: [],
    creatorId: parent.creatorId,
    creatorName: parent.creatorName,
    creatorAvatarUrl: parent.creatorAvatarUrl,
    time: null,
    totalLoggedSecs: 0,
    userLoggedSecs: 0,
    estimatedTime: null,
    startDate: sub.startDateIso
      ? parseDay(sub.startDateIso).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
        })
      : null,
    startDateIso: sub.startDateIso,
    due: null,
    dueDateIso: sub.dueDateIso,
    dueUrgent: false,
    dueOverdue: false,
    targetDateIsos: [],
    createdIso: parent.createdIso,
    hasIntake: false,
    isComplete: false,
    lastMessageDirection: null,
  };
}

/** Flatten parent tickets and scheduled sub-tickets into timeline tasks. */
export function collectTimelineTasks(
  cards: BoardCardData[],
  localRanges: Map<string, TaskDateRange>,
): TimelineTask[] {
  const tasks: TimelineTask[] = [];
  const seen = new Set<string>();

  function pushTask(
    card: BoardCardData,
    parentDbId: string | null,
    parentHumanId: string | null,
    isSubTicket: boolean,
  ) {
    if (seen.has(card.dbId)) return;
    const base = resolveTaskRange(card);
    if (!base) return;
    seen.add(card.dbId);
    const override = localRanges.get(card.dbId);
    tasks.push({
      ...base,
      ...(override ? { range: override } : {}),
      parentDbId,
      parentHumanId,
      isSubTicket,
    });
  }

  for (const card of cards) {
    pushTask(card, null, null, false);
    for (const sub of card.subTicketCards) {
      pushTask(subCardToBoardCard(sub, card), card.dbId, card.humanId, true);
    }
  }

  return tasks;
}

export function computeTimelineBounds(
  tasks: TimelineTask[],
  paddingDays = 14,
): { start: Date; end: Date } {
  const today = startOfDay(new Date());

  if (tasks.length === 0) {
    return {
      start: addDays(today, -paddingDays),
      end: addDays(today, paddingDays * 2),
    };
  }

  let min = tasks[0].range.start;
  let max = tasks[0].range.end;

  for (const t of tasks) {
    if (t.range.start < min) min = t.range.start;
    if (t.range.end > max) max = t.range.end;
  }

  min = addDays(min, -paddingDays);
  max = addDays(max, paddingDays);

  if (today < min) min = addDays(today, -7);
  if (today > max) max = addDays(today, 21);

  return { start: min, end: max };
}

export function daysBetween(a: Date, b: Date): number {
  return differenceInCalendarDays(startOfDay(b), startOfDay(a));
}

export function positionForDate(
  date: Date,
  rangeStart: Date,
  dayWidth: number,
): number {
  return daysBetween(rangeStart, date) * dayWidth;
}

export function widthForRange(range: TaskDateRange, dayWidth: number): number {
  const days = Math.max(1, daysBetween(range.start, range.end) + 1);
  return days * dayWidth - 4;
}

/** Greedy lane assignment for overlapping tasks within one assignee row. */
export type LaneLayout = {
  lanes: TimelineTask[][];
  laneIndex: Map<string, number>;
};

export function layoutTaskLanes(tasks: TimelineTask[]): LaneLayout {
  const sorted = [...tasks].sort(
    (a, b) => a.range.start.getTime() - b.range.start.getTime(),
  );
  const lanes: TimelineTask[][] = [];
  const laneIndex = new Map<string, number>();

  for (const task of sorted) {
    let placed = false;
    for (let i = 0; i < lanes.length; i++) {
      const last = lanes[i][lanes[i].length - 1];
      if (task.range.start > last.range.end) {
        lanes[i].push(task);
        laneIndex.set(task.dbId, i);
        placed = true;
        break;
      }
    }
    if (!placed) {
      laneIndex.set(task.dbId, lanes.length);
      lanes.push([task]);
    }
  }

  return { lanes, laneIndex };
}

/** @deprecated use layoutTaskLanes */
export function assignLanes(tasks: TimelineTask[]): Map<string, number> {
  return layoutTaskLanes(tasks).laneIndex;
}

function laneHeight(lane: TimelineTask[]): number {
  return Math.max(...lane.map(barHeightForTask));
}

export function rowHeightFromLayout(layout: LaneLayout): number {
  if (layout.lanes.length === 0) return ROW_HEIGHT;
  let h = LANE_PAD_TOP + LANE_PAD_BOTTOM;
  for (const lane of layout.lanes) {
    h += laneHeight(lane) + LANE_GAP;
  }
  return Math.max(ROW_HEIGHT, h - LANE_GAP);
}

export function barTopY(layout: LaneLayout, taskId: string): number {
  const laneIdx = layout.laneIndex.get(taskId) ?? 0;
  let top = LANE_PAD_TOP;
  for (let i = 0; i < laneIdx; i++) {
    top += laneHeight(layout.lanes[i]) + LANE_GAP;
  }
  return top;
}

export function rowHeightForTasks(tasks: TimelineTask[]): number {
  if (tasks.length === 0) return ROW_HEIGHT;
  return rowHeightFromLayout(layoutTaskLanes(tasks));
}

/** Row height for label column + grid, with an optional floor (e.g. project labels). */
export function timelineRowHeight(
  tasks: TimelineTask[],
  minHeight = 0,
): number {
  return Math.max(rowHeightForTasks(tasks), minHeight);
}

function barHeightForTask(task: TimelineTask): number {
  return task.isSubTicket ? SUB_BAR_HEIGHT : BAR_HEIGHT;
}

export function computeBarPositions(
  assigneeRows: AssigneeRow[],
  boundsStart: Date,
  dayWidth: number,
  headerHeight: number,
  rowMinHeight = 0,
): Map<string, BarPosition> {
  const positions = new Map<string, BarPosition>();
  let rowTop = headerHeight;

  for (const row of assigneeRows) {
    const layout = layoutTaskLanes(row.tasks);
    const rowH = timelineRowHeight(row.tasks, rowMinHeight);

    for (const task of row.tasks) {
      const lane = layout.laneIndex.get(task.dbId) ?? 0;
      const barH = barHeightForTask(task);
      const left = positionForDate(task.range.start, boundsStart, dayWidth) + 2;
      const width = Math.max(widthForRange(task.range, dayWidth), 34);
      const topY = rowTop + barTopY(layout, task.dbId);
      const centerX = left + width / 2;
      const centerY = topY + barH / 2;

      positions.set(task.dbId, {
        taskId: task.dbId,
        rowId: row.id,
        rowTop,
        lane,
        left,
        width,
        height: barH,
        centerX,
        centerY,
        topY,
        bottomY: topY + barH,
      });
    }

    rowTop += rowH;
  }

  return positions;
}

const ROUTE_MARGIN = 12;

function barRight(bar: BarPosition): number {
  return bar.left + bar.width;
}

function verticalSegmentHitsBar(
  x: number,
  yStart: number,
  yEnd: number,
  bar: BarPosition,
): boolean {
  const yMin = Math.min(yStart, yEnd);
  const yMax = Math.max(yStart, yEnd);
  return (
    bar.bottomY > yMin &&
    bar.topY < yMax &&
    x >= bar.left - ROUTE_MARGIN &&
    x <= barRight(bar) + ROUTE_MARGIN
  );
}

function findClearVerticalCorridorX(
  yStart: number,
  yEnd: number,
  xHint: number,
  obstacles: BarPosition[],
): number {
  if (
    !obstacles.some((bar) => verticalSegmentHitsBar(xHint, yStart, yEnd, bar))
  ) {
    return xHint;
  }

  const tryDirection = (dir: 1 | -1) => {
    let x = xHint + dir * ROUTE_MARGIN;
    for (let i = 0; i < 40; i++) {
      const blockers = obstacles.filter((bar) =>
        verticalSegmentHitsBar(x, yStart, yEnd, bar),
      );
      if (blockers.length === 0) return x;
      x =
        dir > 0
          ? Math.max(...blockers.map((bar) => barRight(bar))) + ROUTE_MARGIN
          : Math.min(...blockers.map((bar) => bar.left)) - ROUTE_MARGIN;
    }
    return x;
  };

  const rightX = tryDirection(1);
  const leftX = tryDirection(-1);
  return Math.abs(rightX - xHint) <= Math.abs(leftX - xHint) ? rightX : leftX;
}

function curvedViaCorridor(
  xStart: number,
  yStart: number,
  xEnd: number,
  yEnd: number,
  xVia: number,
): string {
  const dy = Math.max(16, Math.min(52, Math.abs(yEnd - yStart) / 3));
  const yTurn1 = yStart + (yEnd >= yStart ? dy : -dy);
  const yTurn2 = yEnd - (yEnd >= yStart ? dy : -dy);

  if (Math.abs(xVia - xStart) < 4 && Math.abs(xVia - xEnd) < 4) {
    return `M ${xStart} ${yStart} C ${xStart} ${yTurn1}, ${xEnd} ${yTurn2}, ${xEnd} ${yEnd}`;
  }

  const yMid = (yTurn1 + yTurn2) / 2;
  return [
    `M ${xStart} ${yStart}`,
    `C ${xStart} ${yTurn1}, ${xVia} ${yTurn1}, ${xVia} ${yMid}`,
    `S ${xEnd} ${yTurn2}, ${xEnd} ${yEnd}`,
  ].join(" ");
}

function barsOverlapHorizontally(a: BarPosition, b: BarPosition): boolean {
  return a.left < barRight(b) && b.left < barRight(a);
}

function buildSameRowRelationPath(
  parent: BarPosition,
  child: BarPosition,
  obstacles: BarPosition[],
): string {
  const rowObstacles = obstacles.filter((bar) => bar.rowId === parent.rowId);
  const verticallySeparated = Math.abs(child.centerY - parent.centerY) > 6;
  const stacked = verticallySeparated && barsOverlapHorizontally(parent, child);

  if (stacked) {
    const xHint = (parent.centerX + child.centerX) / 2;
    const xRoute = findClearVerticalCorridorX(
      parent.bottomY,
      child.topY,
      xHint,
      rowObstacles,
    );
    return curvedViaCorridor(
      parent.centerX,
      parent.bottomY,
      child.centerX,
      child.topY,
      xRoute,
    );
  }

  const childIsRight = child.left >= barRight(parent) - 4;
  const x1 = childIsRight ? barRight(parent) : parent.left;
  const x2 = childIsRight ? child.left : barRight(child);
  const y1 = parent.centerY;
  const y2 = child.centerY;

  const xMin = Math.min(x1, x2);
  const xMax = Math.max(x1, x2);
  const yMin = Math.min(y1, y2) - 6;
  const yMax = Math.max(y1, y2) + 6;

  const blocking = rowObstacles.filter(
    (bar) =>
      barRight(bar) > xMin &&
      bar.left < xMax &&
      bar.bottomY > yMin &&
      bar.topY < yMax,
  );

  if (blocking.length === 0) {
    const midX = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
  }

  const yAbove = Math.min(...blocking.map((bar) => bar.topY)) - ROUTE_MARGIN;
  const yBelow = Math.max(...blocking.map((bar) => bar.bottomY)) + ROUTE_MARGIN;
  const yRoute =
    Math.abs(yAbove - y1) <= Math.abs(yBelow - y1) ? yAbove : yBelow;
  const dx = Math.max(18, Math.min(44, (xMax - xMin) / 4));
  const midX = (x1 + x2) / 2;

  return [
    `M ${x1} ${y1}`,
    `C ${x1 + (childIsRight ? dx : -dx)} ${y1}, ${midX} ${yRoute}, ${midX} ${yRoute}`,
    `S ${x2 + (childIsRight ? -dx : dx)} ${y2}, ${x2} ${y2}`,
  ].join(" ");
}

function buildCrossRowRelationPath(
  parent: BarPosition,
  child: BarPosition,
  obstacles: BarPosition[],
): string {
  const y1 = parent.bottomY;
  const y2 = child.topY;
  const xHint = (parent.centerX + child.centerX) / 2;
  const inBand = obstacles.filter((bar) => bar.bottomY > y1 && bar.topY < y2);
  const xRoute = findClearVerticalCorridorX(y1, y2, xHint, inBand);

  return curvedViaCorridor(parent.centerX, y1, child.centerX, y2, xRoute);
}

export function buildParentChildLinks(
  tasks: TimelineTask[],
  positions: Map<string, BarPosition>,
): TimelineRelation[] {
  const allBars = [...positions.values()];
  const links: TimelineRelation[] = [];

  for (const task of tasks) {
    if (!task.parentDbId) continue;
    const parentPos = positions.get(task.parentDbId);
    const childPos = positions.get(task.dbId);
    if (!parentPos || !childPos) continue;

    const obstacles = allBars.filter(
      (bar) =>
        bar.taskId !== parentPos.taskId && bar.taskId !== childPos.taskId,
    );

    const path =
      parentPos.rowId === childPos.rowId
        ? buildSameRowRelationPath(parentPos, childPos, obstacles)
        : buildCrossRowRelationPath(parentPos, childPos, obstacles);

    links.push({ parentId: task.parentDbId, childId: task.dbId, path });
  }

  return links;
}

export function totalTimelineBodyHeight(
  assigneeRows: AssigneeRow[],
  headerHeight: number,
  rowMinHeight = 0,
  bottomPad = 0,
): number {
  let h = headerHeight;
  for (const row of assigneeRows) {
    h += timelineRowHeight(row.tasks, rowMinHeight);
  }
  return h + bottomPad;
}

export function groupByAssignee(tasks: TimelineTask[]): AssigneeRow[] {
  const map = new Map<string, AssigneeRow>();

  for (const task of tasks) {
    const id = task.assigneeId ?? "__unassigned__";
    const name = task.assigneeName ?? "Unassigned";
    const existing = map.get(id);
    if (existing) {
      existing.tasks.push(task);
    } else {
      map.set(id, {
        id,
        name,
        subDepartmentLabel: null,
        avatarUrl: task.assigneeAvatarUrl,
        avatarColor: task.avatarColor,
        tasks: [task],
      });
    }
  }

  for (const row of map.values()) {
    const subDepartments = [...new Set(row.tasks.map((task) => task.subDepartment).filter(Boolean))].sort();
    row.subDepartmentLabel = subDepartments.length > 0 ? subDepartments.join(", ") : null;
  }

  return [...map.values()].sort((a, b) => {
    if (a.id === "__unassigned__") return 1;
    if (b.id === "__unassigned__") return -1;
    const countDiff = b.tasks.length - a.tasks.length;
    if (countDiff !== 0) return countDiff;
    return a.name.localeCompare(b.name);
  });
}

export function groupByProject(tasks: TimelineTask[]): AssigneeRow[] {
  const map = new Map<string, AssigneeRow>();

  for (const task of tasks) {
    const id = task.projectId || "__no_project__";
    const name = task.project?.trim() || "No project";
    const existing = map.get(id);
    if (existing) {
      existing.tasks.push(task);
    } else {
      map.set(id, {
        id,
        name,
        subDepartmentLabel: null,
        avatarUrl: null,
        avatarColor: null,
        projectColor: task.projectColor ?? "#0a76b9",
        projectAvatarUrl: task.projectAvatarUrl ?? null,
        tasks: [task],
      });
    }
  }

  for (const row of map.values()) {
    const assigneeNames = [
      ...new Set(
        row.tasks
          .map((task) => task.assigneeName)
          .filter((name): name is string => Boolean(name)),
      ),
    ].sort();
    row.subDepartmentLabel =
      assigneeNames.length > 0
        ? `${assigneeNames.length} assignee${assigneeNames.length === 1 ? "" : "s"}`
        : null;
  }

  return [...map.values()].sort((a, b) => {
    if (a.id === "__no_project__") return 1;
    if (b.id === "__no_project__") return -1;
    const countDiff = b.tasks.length - a.tasks.length;
    if (countDiff !== 0) return countDiff;
    return a.name.localeCompare(b.name);
  });
}

export function buildDayHeaders(start: Date, end: Date, zoom: TimelineZoom) {
  const days = eachDayOfInterval({ start, end });
  const weekStarts = new Set<string>();

  return days.map((day) => {
    const weekKey = format(startOfWeek(day, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const isWeekStart = !weekStarts.has(weekKey);
    weekStarts.add(weekKey);

    return {
      date: day,
      iso: format(day, "yyyy-MM-dd"),
      dayLabel: format(day, "d"),
      weekday: format(day, zoom === "quarter" ? "EEEEE" : "EEE"),
      monthLabel: format(day, "MMM"),
      isToday: isSameDay(day, new Date()),
      isWeekend: isWeekend(day),
      isWeekStart,
      showMonth: day.getDate() === 1 || (isWeekStart && zoom !== "quarter"),
    };
  });
}

export function shiftRange(
  range: TaskDateRange,
  deltaDays: number,
): TaskDateRange {
  return {
    start: addDays(range.start, deltaDays),
    end: addDays(range.end, deltaDays),
  };
}

export function resizeRangeStart(
  range: TaskDateRange,
  newStart: Date,
): TaskDateRange {
  const start = startOfDay(newStart);
  const end = range.end < start ? start : range.end;
  return { start, end };
}

export function resizeRangeEnd(
  range: TaskDateRange,
  newEnd: Date,
): TaskDateRange {
  const end = startOfDay(newEnd);
  const start = range.start > end ? end : range.start;
  return { start, end };
}
