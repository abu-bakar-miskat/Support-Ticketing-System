import "server-only";
import { prisma } from "@/lib/db";
import { sendInviteEmail, sendTenantInviteEmail } from "@/lib/email";
import { INVITE_REMINDER_AFTER_MS } from "./constants";

/**
 * Send the one-time "your invitation is still pending" reminder for every invite
 * (department + tenant) that has been sitting unaccepted for at least
 * {@link INVITE_REMINDER_AFTER_MS} (24h) and is still valid.
 *
 * The `where` is the guarantee behind every acceptance criterion:
 *   - `acceptedAt: null`  → never remind an already-accepted invite,
 *   - `revokedAt: null`   → never remind a cancelled invite,
 *   - `expiresAt: { gt }` → never remind an already-expired invite,
 *   - `reminderSentAt: null` + the post-send stamp → exactly one reminder each.
 *
 * `reminderSentAt` is stamped only after the send resolves without throwing, so a
 * transient email failure leaves the invite eligible for the next sweep rather
 * than silently swallowing the reminder. Each send is isolated so one failure
 * doesn't halt the batch. Intended to run under `runAsSystem` (the cron wrapper).
 */
export async function sweepInviteReminders(now: Date = new Date()): Promise<number> {
  const reminderThreshold = new Date(now.getTime() - INVITE_REMINDER_AFTER_MS);
  const pendingWhere = {
    acceptedAt: null,
    revokedAt: null,
    reminderSentAt: null,
    createdAt: { lte: reminderThreshold },
    expiresAt: { gt: now },
  } as const;

  let sent = 0;

  const deptInvites = await prisma.departmentInvite.findMany({
    where: pendingWhere,
    include: {
      department: { select: { id: true, name: true } },
      subDepartment: { select: { name: true } },
      inviter: { select: { id: true, name: true } },
    },
  });

  for (const invite of deptInvites) {
    try {
      await sendInviteEmail({
        to: invite.email,
        inviterName: invite.inviter.name,
        inviterId: invite.inviter.id,
        departmentId: invite.departmentId,
        departmentName: invite.department.name,
        subDepartmentName: invite.subDepartment.name,
        role: invite.role,
        message: invite.message,
        inviteToken: invite.token,
        expiresAt: invite.expiresAt,
        isReminder: true,
      });
      await prisma.departmentInvite.update({
        where: { id: invite.id },
        data: { reminderSentAt: now },
      });
      sent += 1;
    } catch (err) {
      console.error(`[invite-reminder] department invite ${invite.id} failed:`, err);
    }
  }

  const tenantInvites = await prisma.tenantInvite.findMany({
    where: pendingWhere,
    include: {
      tenant: { select: { name: true } },
      inviter: { select: { id: true, name: true } },
    },
  });

  for (const invite of tenantInvites) {
    // departmentIds is a JSON string[] (empty/absent for tenant-wide admins). The
    // first one, if any, only steers which department's email identity is used.
    const departmentIds = Array.isArray(invite.departmentIds)
      ? (invite.departmentIds as unknown[]).filter((d): d is string => typeof d === "string")
      : [];
    try {
      await sendTenantInviteEmail({
        to: invite.email,
        inviterName: invite.inviter.name,
        inviterId: invite.inviter.id,
        tenantId: invite.tenantId,
        tenantName: invite.tenant.name,
        role: invite.role,
        departmentId: departmentIds[0] ?? null,
        message: invite.message,
        inviteToken: invite.token,
        expiresAt: invite.expiresAt,
        isReminder: true,
      });
      await prisma.tenantInvite.update({
        where: { id: invite.id },
        data: { reminderSentAt: now },
      });
      sent += 1;
    } catch (err) {
      console.error(`[invite-reminder] tenant invite ${invite.id} failed:`, err);
    }
  }

  return sent;
}
