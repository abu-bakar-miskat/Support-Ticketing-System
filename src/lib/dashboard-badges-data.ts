import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { getProfileDeptScope, getPersonalTaskDeptScope } from "@/lib/dept-scope";
import { runAsSystem } from "@/lib/request-scope";
import type { AuthProfile } from "@/lib/auth";

export const getDashboardBadgesData = cache(async (profile: AuthProfile) => {
  const [deptScope, personalScope] = await Promise.all([getProfileDeptScope(profile), getPersonalTaskDeptScope(profile)]);
  const deptIds = deptScope?.subDepartmentIds;
  const personalIds = personalScope?.subDepartmentIds;
  const [myTasksCount, mentionsCount, inboxCount] = await runAsSystem(() => Promise.all([
    prisma.ticket.count({ where: {
      assigneeId: profile.id, deletedAt: null,
      status: { notIn: ["Live", "Done", "Completed", "Closed"] },
      ...(personalIds && personalIds.length > 0 ? { subDepartmentId: { in: personalIds } } : {}),
    } }),
    prisma.mention.count({ where: {
      mentionedUserId: profile.id, readAt: null,
      ...(deptIds && deptIds.length > 0 ? { comment: { ticket: { subDepartmentId: { in: deptIds } } } } : {}),
    } }),
    prisma.notification.count({ where: {
      recipientId: profile.id, readAt: null,
      ...(deptIds && deptIds.length > 0 ? { OR: [{ ticketId: null }, { ticket: { subDepartmentId: { in: deptIds } } }] } : {}),
    } }),
  ]));
  return { myTasksCount, mentionsCount, inboxCount };
});
