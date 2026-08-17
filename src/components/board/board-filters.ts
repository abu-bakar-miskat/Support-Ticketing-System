import {
  endOfWeek,
  isSameDay,
  isWithinInterval,
  parseISO,
  startOfDay,
} from "date-fns";
import { normalizeStatus, type BoardCardData } from "@/components/board/board-types";
import { isDueOverdue } from "@/lib/format";

export type PriorityFilter = "all" | "urgent" | "critical" | "high_plus" | "high" | "medium" | "low";
export type DateFilter = "all" | "overdue" | "today" | "week" | "none";
export type IntakeFilter = "all" | "intake" | "non_intake";
export type ProjectFilter = string; // "all" or a projectId
export type ModuleFilter = string; // "all" or a moduleId
export type LabelFilter = string[]; // empty = all

export function isAssignedToUser(card: BoardCardData, userId: string): boolean {
  if (!userId) return false;
  return (
    card.assigneeId === userId ||
    card.coAssignees.some((a) => a.id === userId) ||
    card.qaAssignees.some((a) => a.id === userId)
  );
}

/** True when the user is on this card only as a QA assignee (not dev assignee/co-assignee). */
export function isQaForUser(card: BoardCardData, userId: string): boolean {
  if (!userId) return false;
  return card.qaAssignees.some((a) => a.id === userId);
}

export function matchesAssigneeFilter(
  card: BoardCardData,
  filter: string,
  userId: string,
): boolean {
  if (filter === "all") return true;
  if (filter === "me") return isAssignedToUser(card, userId);
  if (filter === "unassigned") return !card.assigneeId;
  return (
    card.assigneeId === filter ||
    card.coAssignees.some((a) => a.id === filter) ||
    card.qaAssignees.some((a) => a.id === filter)
  );
}

export function matchesPriorityFilter(
  card: BoardCardData,
  filter: PriorityFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "high_plus") {
    return card.priority === "high" || card.priority === "critical" || card.priority === "urgent";
  }
  return card.priority === filter;
}

export function matchesDateFilter(card: BoardCardData, filter: DateFilter): boolean {
  if (filter === "all") return true;
  if (filter === "none") return !card.dueDateIso;

  if (!card.dueDateIso) return false;

  const due = parseISO(card.dueDateIso);
  const today = startOfDay(new Date());

  if (filter === "overdue") {
    return (
      isDueOverdue(due) &&
      normalizeStatus(card.status) !== "Live" &&
      normalizeStatus(card.status) !== "Blocked"
    );
  }
  if (filter === "today") return isSameDay(due, today);
  if (filter === "week") {
    return isWithinInterval(due, {
      start: today,
      end: endOfWeek(today, { weekStartsOn: 1 }),
    });
  }
  return true;
}

/** Inclusive calendar range against the ticket due date (not created-at). */
export function matchesDueRange(
  card: BoardCardData,
  range: { from: string; to: string } | null,
): boolean {
  if (!range) return true;
  if (!card.dueDateIso) return false;
  const due = new Date(card.dueDateIso);
  const from = new Date(range.from);
  const to = new Date(`${range.to}T23:59:59`);
  return due >= from && due <= to;
}

/** Preset match against ANY assignee's personal target date. */
export function matchesTargetDateFilter(
  card: BoardCardData,
  filter: DateFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "none") return card.targetDateIsos.length === 0;
  if (card.targetDateIsos.length === 0) return false;

  const today = startOfDay(new Date());
  const notDone =
    normalizeStatus(card.status) !== "Live" &&
    normalizeStatus(card.status) !== "Blocked";

  return card.targetDateIsos.some((iso) => {
    const d = parseISO(iso);
    if (filter === "overdue") return isDueOverdue(d) && notDone;
    if (filter === "today") return isSameDay(d, today);
    if (filter === "week") {
      return isWithinInterval(d, {
        start: today,
        end: endOfWeek(today, { weekStartsOn: 1 }),
      });
    }
    return true;
  });
}

/** Inclusive calendar range against ANY assignee's personal target date. */
export function matchesTargetDateRange(
  card: BoardCardData,
  range: { from: string; to: string } | null,
): boolean {
  if (!range) return true;
  if (card.targetDateIsos.length === 0) return false;
  const from = new Date(range.from);
  const to = new Date(`${range.to}T23:59:59`);
  return card.targetDateIsos.some((iso) => {
    const d = new Date(iso);
    return d >= from && d <= to;
  });
}

export function matchesProjectFilter(card: BoardCardData, filter: ProjectFilter): boolean {
  if (filter === "all") return true;
  return card.projectId === filter;
}

export function collectProjects(cards: BoardCardData[]) {
  const map = new Map<string, string>();
  for (const card of cards) {
    if (card.projectId && card.project) map.set(card.projectId, card.project);
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function matchesModuleFilter(card: BoardCardData, filter: ModuleFilter): boolean {
  if (filter === "all") return true;
  return card.moduleId === filter;
}

export function collectModules(cards: BoardCardData[]) {
  const map = new Map<string, string>();
  for (const card of cards) {
    if (card.moduleId && card.moduleName) map.set(card.moduleId, card.moduleName);
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function matchesIntakeFilter(card: BoardCardData, filter: IntakeFilter): boolean {
  if (filter === "all") return true;
  if (filter === "intake") return card.hasIntake;
  return !card.hasIntake;
}

export function collectAssignees(cards: BoardCardData[]) {
  const map = new Map<string, { id: string; name: string; avatarUrl?: string | null }>();
  for (const card of cards) {
    if (card.assigneeId && card.assigneeName) {
      map.set(card.assigneeId, {
        id: card.assigneeId,
        name: card.assigneeName,
        avatarUrl: card.assigneeAvatarUrl,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function countAssigneeMatches(
  cards: BoardCardData[],
  filter: string,
  userId: string,
): number {
  return cards.filter((c) => matchesAssigneeFilter(c, filter, userId)).length;
}

export function matchesLabelFilter(card: BoardCardData, filter: LabelFilter): boolean {
  if (!filter.length) return true;
  return filter.some((lbl) => card.labels.includes(lbl));
}

export function collectLabels(cards: BoardCardData[]): string[] {
  const set = new Set<string>();
  for (const card of cards) {
    for (const lbl of card.labels) set.add(lbl);
  }
  return [...set].sort();
}
