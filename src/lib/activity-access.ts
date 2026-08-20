import type { AuthProfile } from "@/lib/auth";
import type { Prisma } from "@/generated/prisma/client";

export function isOwnActivityOnly(profile: Pick<AuthProfile, "role">): boolean {
  return profile.role === "agent" || profile.role === "sub_manager";
}

export function canViewDeptActivity(profile: Pick<AuthProfile, "role">): boolean {
  return profile.role === "admin" || profile.role === "manager";
}

/** Staff/lead always see themselves; managers/admins may filter by member. */
export function resolveActivityActorId(
  profile: Pick<AuthProfile, "id" | "role">,
  requestedActorId?: string | null,
): string | undefined {
  if (isOwnActivityOnly(profile)) return profile.id;
  return requestedActorId || undefined;
}

export function buildActivityTicketWhere(
  subDepartmentIds: string[],
  projectId?: string | null,
  tenantId?: string | null,
): Prisma.TicketWhereInput {
  return {
    // Bound by team when scoped; otherwise (admin global) bound by tenant so
    // activity never spans tenants.
    ...(subDepartmentIds.length > 0 ? { subDepartmentId: { in: subDepartmentIds } } : tenantId ? { tenantId } : {}),
    ...(projectId ? { projectId } : {}),
  };
}

type ActivityLogFilters = {
  from?: Date;
  to?: Date;
  projectId?: string | null;
  action?: string | null;
  actorId?: string | null;
};

export function buildActivityLogWhere(
  profile: Pick<AuthProfile, "id" | "role">,
  subDepartmentIds: string[],
  filters: ActivityLogFilters,
  tenantId?: string | null,
): Prisma.ActivityLogWhereInput {
  const actorId = resolveActivityActorId(profile, filters.actorId);

  return {
    ticket: buildActivityTicketWhere(subDepartmentIds, filters.projectId, tenantId),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
    ...(actorId ? { actorId } : {}),
    ...(filters.action ? { action: filters.action as never } : {}),
  };
}
