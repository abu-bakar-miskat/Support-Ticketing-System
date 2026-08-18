import type { QueryClient } from "@tanstack/react-query";
import type { TeamStatusConfig } from "@/components/board/board-types";
import type { MyTasksResponse, TasksMetaResponse } from "@/lib/api/tasks";
import type { TeamStatus } from "@/lib/api/teams";
import { teamKeys, taskKeys } from "./keys";

type StatusPatch = Partial<TeamStatusConfig>;

function patchStatusList(
  list: TeamStatusConfig[],
  statusId: string,
  patch: StatusPatch,
): TeamStatusConfig[] {
  return list.map((status) =>
    status.id === statusId ? { ...status, ...patch } : status,
  );
}

/** Optimistically sync a workflow status change across React Query caches. */
export function patchTeamStatusInCaches(
  queryClient: QueryClient,
  teamId: string,
  statusId: string,
  patch: StatusPatch,
) {
  queryClient.setQueryData<TeamStatus[]>(teamKeys.statuses(teamId), (old) =>
    old?.length ? (patchStatusList(old, statusId, patch) as TeamStatus[]) : old,
  );

  queryClient.setQueryData<MyTasksResponse>(taskKeys.my(), (old) => {
    if (!old?.teamStatusMap?.[teamId]) return old;
    return {
      ...old,
      teamStatusMap: {
        ...old.teamStatusMap,
        [teamId]: patchStatusList(old.teamStatusMap[teamId], statusId, patch),
      },
    };
  });

  queryClient.setQueriesData<TasksMetaResponse>(
    { queryKey: ["tasks", "meta"] },
    (old) => {
      if (!old?.teamStatuses?.length) return old;
      const teamStatuses = patchStatusList(old.teamStatuses, statusId, patch);
      if (teamStatuses === old.teamStatuses) return old;
      return { ...old, teamStatuses };
    },
  );
}

/** Replace a team's full status list everywhere it is cached. */
export function replaceTeamStatusesInCaches(
  queryClient: QueryClient,
  teamId: string,
  statuses: TeamStatusConfig[],
) {
  queryClient.setQueryData(teamKeys.statuses(teamId), statuses);

  queryClient.setQueryData<MyTasksResponse>(taskKeys.my(), (old) => {
    if (!old?.teamStatusMap) return old;
    return {
      ...old,
      teamStatusMap: { ...old.teamStatusMap, [teamId]: statuses },
    };
  });
}

/** Refetch team workflow statuses after settings changes. */
export function invalidateTeamStatusCaches(
  queryClient: QueryClient,
  teamId?: string,
) {
  if (teamId) {
    void queryClient.invalidateQueries({ queryKey: teamKeys.statuses(teamId) });
  } else {
    void queryClient.invalidateQueries({ queryKey: ["teams"] });
  }
  void queryClient.invalidateQueries({ queryKey: ["tasks", "meta"] });
  void queryClient.invalidateQueries({ queryKey: taskKeys.my() });
}
