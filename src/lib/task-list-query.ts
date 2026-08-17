import "server-only";
import { prisma } from "@/lib/db";
import { getProfileDeptScope, type ProfileLike } from "@/lib/dept-scope";
import type { BoardCardWhere } from "@/lib/board-data";

export type TaskListFilterParams = Omit<
  BoardCardWhere,
  "skip" | "take" | "timeForUserId" | "sortKey"
>;

export type TaskListQuery = {
  filterParams: TaskListFilterParams;
  sortKey: string;
  isAdmin: boolean;
  isManager: boolean;
  isElevated: boolean;
  deptScope: Awaited<ReturnType<typeof getProfileDeptScope>>;
  /** Set when the query params are contradictory (caller should return 400). */
  error: string | null;
};

/**
 * Parses the shared task-list filter/scope params from a request URL.
 * Used by GET /api/tasks/all and the admin ticket export route so both apply
 * identical filters and access scoping.
 */
export async function buildTaskListParams(
  url: URL,
  profile: ProfileLike & { id: string },
): Promise<TaskListQuery> {
  // Filter params
  const search       = url.searchParams.get("search")?.trim() || undefined;
  const statusIn     = url.searchParams.get("status")?.split(",").filter(Boolean)  ?? [];
  const priorityIn   = url.searchParams.get("priority")?.split(",").filter(Boolean) ?? [];
  const projectIdIn  = url.searchParams.get("projectId")?.split(",").filter(Boolean) ?? [];
  const assigneeIdIn = url.searchParams.get("assigneeId")?.split(",").filter(Boolean) ?? [];
  const moduleIdIn   = url.searchParams.get("moduleId")?.split(",").filter(Boolean) ?? [];
  const labelsIn     = url.searchParams.get("labels")?.split(",").filter(Boolean) ?? [];
  const dateFromStr  = url.searchParams.get("dateFrom");
  const dateToStr    = url.searchParams.get("dateTo");
  const targetFromStr = url.searchParams.get("targetDateFrom");
  const targetToStr   = url.searchParams.get("targetDateTo");
  const sortKey      = url.searchParams.get("sort") ?? "created";
  const sourceParam  = url.searchParams.get("source");
  const source       = sourceParam === "intake" || sourceParam === "manual" ? sourceParam : undefined;

  const dateFrom = dateFromStr ? new Date(dateFromStr) : undefined;
  const dateTo   = dateToStr   ? new Date(dateToStr + "T23:59:59.999Z") : undefined;
  const targetDateFrom = targetFromStr ? new Date(targetFromStr) : undefined;
  const targetDateTo   = targetToStr   ? new Date(targetToStr + "T23:59:59.999Z") : undefined;

  // Access scope
  const isAdmin    = profile.role === "admin";
  const isManager  = profile.role === "manager";
  const isElevated = isAdmin || isManager || profile.role === "lead";

  // Unassigned-tickets tab: admin/manager only
  const unassignedOnly = (isAdmin || isManager) && url.searchParams.get("unassigned") === "true";
  const draftsOnly = url.searchParams.get("drafts") === "true";

  if (draftsOnly && unassignedOnly) {
    return {
      filterParams: {},
      sortKey,
      isAdmin,
      isManager,
      isElevated,
      deptScope: null,
      error: "Invalid filter combination",
    };
  }

  const deptScope = await getProfileDeptScope(profile);

  const allowedDeptIds = isManager
    ? [...new Set([...(profile.managedDepartmentIds ?? []), ...(profile.grantedAccessDeptIds ?? [])])]
    : undefined;

  let staffProjectIds: string[] | undefined;
  if (!isElevated && !draftsOnly) {
    const memberships = await prisma.projectMember.findMany({
      where: { userId: profile.id },
      select: { projectId: true },
    });
    staffProjectIds = memberships.map((m) => m.projectId);
  }

  const filterParams: TaskListFilterParams = {
    // Outermost tenant bound — present on every board query so an admin's
    // global (no active dept) view never spans tenants.
    tenantId: profile.activeTenantId ?? undefined,
    ...(draftsOnly
      ? {
          draftsOnly: true,
          ...(isAdmin
            ? deptScope
              ? { allowedDeptIds: deptScope.allowedDeptIds }
              : {}
            : { draftCreatorId: profile.id }),
        }
      : {
          ...(deptScope
            ? { allowedDeptIds: deptScope.allowedDeptIds }
            : isAdmin
              ? {}
              : isManager && allowedDeptIds?.length
                ? { allowedDeptIds }
                : isElevated
                  ? {}
                  : { staffProjectIds, staffUserId: profile.id }),
        }),
    search,
    statusIn:     statusIn.length     ? statusIn     : undefined,
    priorityIn:   priorityIn.length   ? priorityIn   : undefined,
    projectIdIn:  projectIdIn.length  ? projectIdIn  : undefined,
    assigneeIdIn: assigneeIdIn.length ? assigneeIdIn : undefined,
    moduleIdIn:   moduleIdIn.length   ? moduleIdIn   : undefined,
    labelsIn:     labelsIn.length     ? labelsIn     : undefined,
    dateFrom,
    dateTo,
    targetDateFrom,
    targetDateTo,
    unassignedOnly: unassignedOnly || undefined,
    source,
  };

  return { filterParams, sortKey, isAdmin, isManager, isElevated, deptScope, error: null };
}
