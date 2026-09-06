import "server-only";
import { getBoardCards, countBoardCards, resolveBoardCardFilters } from "@/lib/board-data";
import type { TaskListQuery } from "@/lib/task-list-query";
import type { AllTasksResponse } from "@/lib/api/tasks";

/** Shared by the initial server render and subsequent filtered API requests. */
export async function getTaskListData(
  query: TaskListQuery,
  userId: string,
  page = 1,
  limit = 25,
): Promise<AllTasksResponse> {
  const skip = (page - 1) * limit;
  const filterParams = await resolveBoardCardFilters(query.filterParams);
  const [total, tasks] = await Promise.all([
    countBoardCards(filterParams),
    getBoardCards({ ...filterParams, timeForUserId: userId, sortKey: query.sortKey, skip, take: limit }),
  ]);
  return {
    tasks, total, page, limit,
    isPrivileged: query.isElevated || !!query.deptScope,
    canExport: query.isAdmin || query.isManager,
    hasMore: skip + tasks.length < total,
  };
}
