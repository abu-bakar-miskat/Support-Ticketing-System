import type { BoardCardData } from "@/components/board/board-types";
import type { SortKey } from "@/components/tasks/task-filter-dropdown";

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
};

export function sortCards<T extends Pick<BoardCardData, "createdIso" | "title" | "priority" | "dueDateIso" | "status" | "project">>(
  cards: T[],
  sortKey: SortKey,
): T[] {
  return [...cards].sort((a, b) => {
    switch (sortKey) {
      case "created":
        return b.createdIso.localeCompare(a.createdIso);
      case "title":
        return a.title.localeCompare(b.title);
      case "priority":
        return (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
      case "due": {
        if (!a.dueDateIso && !b.dueDateIso) return 0;
        if (!a.dueDateIso) return 1;
        if (!b.dueDateIso) return -1;
        return a.dueDateIso.localeCompare(b.dueDateIso);
      }
      case "status":
        return a.status.localeCompare(b.status);
      case "project":
        return a.project.localeCompare(b.project);
      case "updated":
        return b.createdIso.localeCompare(a.createdIso);
      default:
        return 0;
    }
  });
}
