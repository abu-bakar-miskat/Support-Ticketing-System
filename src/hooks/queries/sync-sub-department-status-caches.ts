import type { QueryClient } from "@tanstack/react-query";
import type { SubDepartmentStatusConfig } from "@/components/board/board-types";
import type { MyTasksResponse, TasksMetaResponse } from "@/lib/api/tasks";
import type { SubDepartmentStatus } from "@/lib/api/sub-departments";
import { subDepartmentKeys, taskKeys } from "./keys";

type StatusPatch = Partial<SubDepartmentStatusConfig>;

function patchStatusList(
  list: SubDepartmentStatusConfig[],
  statusId: string,
  patch: StatusPatch,
): SubDepartmentStatusConfig[] {
  return list.map((status) =>
    status.id === statusId ? { ...status, ...patch } : status,
  );
}

/** Optimistically sync a workflow status change across React Query caches. */
export function patchSubDepartmentStatusInCaches(
  queryClient: QueryClient,
  subDepartmentId: string,
  statusId: string,
  patch: StatusPatch,
) {
  queryClient.setQueryData<SubDepartmentStatus[]>(subDepartmentKeys.statuses(subDepartmentId), (old) =>
    old?.length ? (patchStatusList(old, statusId, patch) as SubDepartmentStatus[]) : old,
  );

  queryClient.setQueryData<MyTasksResponse>(taskKeys.my(), (old) => {
    if (!old?.subDepartmentStatusMap?.[subDepartmentId]) return old;
    return {
      ...old,
      subDepartmentStatusMap: {
        ...old.subDepartmentStatusMap,
        [subDepartmentId]: patchStatusList(old.subDepartmentStatusMap[subDepartmentId], statusId, patch),
      },
    };
  });

  queryClient.setQueriesData<TasksMetaResponse>(
    { queryKey: ["tasks", "meta"] },
    (old) => {
      if (!old?.subDepartmentStatuses?.length) return old;
      const subDepartmentStatuses = patchStatusList(old.subDepartmentStatuses, statusId, patch);
      if (subDepartmentStatuses === old.subDepartmentStatuses) return old;
      return { ...old, subDepartmentStatuses };
    },
  );
}

/** Replace a team's full status list everywhere it is cached. */
export function replaceSubDepartmentStatusesInCaches(
  queryClient: QueryClient,
  subDepartmentId: string,
  statuses: SubDepartmentStatusConfig[],
) {
  queryClient.setQueryData(subDepartmentKeys.statuses(subDepartmentId), statuses);

  queryClient.setQueryData<MyTasksResponse>(taskKeys.my(), (old) => {
    if (!old?.subDepartmentStatusMap) return old;
    return {
      ...old,
      subDepartmentStatusMap: { ...old.subDepartmentStatusMap, [subDepartmentId]: statuses },
    };
  });
}

/** Refetch team workflow statuses after settings changes. */
export function invalidateSubDepartmentStatusCaches(
  queryClient: QueryClient,
  subDepartmentId?: string,
) {
  if (subDepartmentId) {
    void queryClient.invalidateQueries({ queryKey: subDepartmentKeys.statuses(subDepartmentId) });
  } else {
    void queryClient.invalidateQueries({ queryKey: ["teams"] });
  }
  void queryClient.invalidateQueries({ queryKey: ["tasks", "meta"] });
  void queryClient.invalidateQueries({ queryKey: taskKeys.my() });
}
