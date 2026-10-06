import "server-only";
import { prisma } from "@/lib/db";
import { sendInviteEmail, sendTenantInviteEmail } from "@/lib/email";
import { INVITE_REMINDER_AFTER_MS, INVITE_TTL_MS } from "./constants";

/**
 * Send the one-time "your invitation is still pending" reminder for every invite
 * (department + tenant) that is within its final {@link INVITE_REMINDER_AFTER_MS}
 * (12h) before expiry and is still valid.
 *
 * The `where` is the guarantee behind every acceptance criterion:
 *   - `acceptedAt: null`  → never remind an already-accepted invite,
 *   - `revokedAt: null`   → never remind a cancelled invite,
 *   - `expiresAt: { gt, lte }` → only once inside the pre-expiry reminder window,
 *   - `reminderSentAt: null` + the post-send stamp → exactly one reminder each.
 *
 * `reminderSentAt` is stamped only after the send resolves without throwing, so a
 * transient email failure leaves the invite eligible for the next sweep rather
 * than silently swallowing the reminder. Each send is isolated so one failure
 * doesn't halt the batch. Intended to run under `runAsSystem` (the cron wrapper).
 */
export async function sweepInviteReminders(now: Date = new Date()): Promise<number> {
  // Anchor eligibility on time-left-before-expiry, not createdAt. A reminder goes
  // out once the invite is within its final stretch (TTL − REMINDER_AFTER = 12h)
  // of expiring. This is equivalent to "12h after creation" for a fresh invite,
  // but — unlike a createdAt threshold — a resend (which pushes expiresAt out and
  // clears reminderSentAt) correctly restarts the clock instead of firing a
  // reminder on the very next sweep.
  const remindWhenExpiryWithinMs = INVITE_TTL_MS - INVITE_REMINDER_AFTER_MS;
  const reminderCutoff = new Date(now.getTime() + remindWhenExpiryWithinMs);
  const pendingWhere = {
    acceptedAt: null,
    revokedAt: null,
    reminderSentAt: null,
    expiresAt: { gt: now, lte: reminderCutoff },
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
