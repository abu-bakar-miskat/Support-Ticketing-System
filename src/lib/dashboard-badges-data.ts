import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { getProfileDeptScope, getPersonalTaskDeptScope } from "@/lib/dept-scope";
import { runAsSystem } from "@/lib/request-scope";
import type { AuthProfile } from "@/lib/auth";

export const getDashboardBadgesData = cache(async (profile: AuthProfile) => {
  const [deptScope, personalScope] = await Promise.all([getProfileDeptScope(profile), getPersonalTaskDeptScope(profile)]);
  const deptIds = deptScope?.subDepartmentIds;
  const activeDeptId = deptScope?.activeDeptId ?? null;
  const personalIds = personalScope?.subDepartmentIds;
  const completeStatuses = await runAsSystem(() => prisma.subDepartmentStatus.findMany({
    where: { category: "COMPLETE", ...(personalIds?.length ? { subDepartmentId: { in: personalIds } } : {}) },
    select: { subDepartmentId: true, label: true },
  }));
  const [myTasksCount, mentionsCount, inboxCount] = await runAsSystem(() => Promise.all([
    prisma.ticket.count({ where: {
      assigneeId: profile.id, deletedAt: null,
      ...(completeStatuses.length ? { NOT: completeStatuses.map((s) => ({ subDepartmentId: s.subDepartmentId, status: s.label })) } : {}),
      ...(personalIds && personalIds.length > 0 ? { subDepartmentId: { in: personalIds } } : {}),
    } }),
    prisma.mention.count({ where: {
      mentionedUserId: profile.id, readAt: null,
      ...(deptIds && deptIds.length > 0 ? { comment: { ticket: { subDepartmentId: { in: deptIds } } } } : {}),
    } }),
    countUnreadNotifications(profile.id, deptIds, activeDeptId),
  ]));
  return { myTasksCount, mentionsCount, inboxCount };
});

/** Unread bell count — shared by the layout badge and the notification panel so they agree. */
export function countUnreadNotifications(
  recipientId: string,
  deptIds: string[] | undefined,
  activeDeptId: string | null,
) {
  return prisma.notification.count({ where: {
    recipientId, readAt: null,
    // Department-scoped: ticket notifications limited to the active department's
    // sub-departments, join-request notifications to the active department, and
    // other (system, non-ticket/non-join) notifications kept.
    ...(activeDeptId ? { OR: [
      { ticket: { subDepartmentId: { in: deptIds ?? [] } } },
      { joinRequest: { subDepartment: { departmentId: activeDeptId } } },
      { AND: [{ ticketId: null }, { joinRequestId: null }] },
    ] } : {}),
  } });
}
