import "server-only"
import { prisma } from "@/lib/db"

function profileNameFromUser(user: {
  email?: string | null
  user_metadata?: Record<string, unknown>
}) {
  const metadata = user.user_metadata ?? {}
  const fromMetadata =
    (typeof metadata.name === "string" && metadata.name) ||
    (typeof metadata.full_name === "string" && metadata.full_name)

  if (fromMetadata) return fromMetadata
  if (user.email) return user.email.split("@")[0]
  return "User"
}

/** Move all FK references from a soft-deleted profile id to the new auth id. */
async function migrateProfileAuthId(oldId: string, newId: string) {
  if (oldId === newId) return

  const existing = await prisma.profile.findUnique({ where: { id: oldId } })
  if (!existing) return

  const realEmail = existing.email
  const orphanEmail = `orphan-${oldId}@deleted.local`

  await prisma.profile.update({
    where: { id: oldId },
    data: { email: orphanEmail },
  })

  await prisma.profile.create({
    data: {
      id: newId,
      email: realEmail,
      name: existing.name,
      role: existing.role,
      avatarUrl: existing.avatarUrl,
      subDepartmentId: existing.subDepartmentId,
      createdAt: existing.createdAt,
      timezone: existing.timezone,
      notificationPrefs: existing.notificationPrefs ?? undefined,
      preferences: existing.preferences ?? undefined,
      deletedAt: null,
    },
  })

  await prisma.$transaction([
    prisma.departmentManager.updateMany({ where: { userId: oldId }, data: { userId: newId } }),
    prisma.departmentManager.updateMany({ where: { assignedBy: oldId }, data: { assignedBy: newId } }),
    prisma.departmentAccess.updateMany({ where: { userId: oldId }, data: { userId: newId } }),
    prisma.departmentAccess.updateMany({ where: { grantedBy: oldId }, data: { grantedBy: newId } }),
    (prisma.subDepartmentMembership as any).updateMany({ where: { userId: oldId }, data: { userId: newId } }),
    prisma.joinRequest.updateMany({ where: { userId: oldId }, data: { userId: newId } }),
    prisma.joinRequest.updateMany({ where: { processedBy: oldId }, data: { processedBy: newId } }),
    (prisma.ticketAssignee as any).updateMany({ where: { userId: oldId }, data: { userId: newId } }),
    (prisma.projectMember as any).updateMany({ where: { userId: oldId }, data: { userId: newId } }),
    prisma.ticket.updateMany({ where: { assigneeId: oldId }, data: { assigneeId: newId } }),
    prisma.ticket.updateMany({ where: { creatorId: oldId }, data: { creatorId: newId } }),
    prisma.comment.updateMany({ where: { authorId: oldId }, data: { authorId: newId } }),
    prisma.attachment.updateMany({ where: { uploaderProfileId: oldId }, data: { uploaderProfileId: newId } }),
    prisma.mention.updateMany({ where: { mentionedUserId: oldId }, data: { mentionedUserId: newId } }),
    prisma.activityLog.updateMany({ where: { actorId: oldId }, data: { actorId: newId } }),
    prisma.sprint.updateMany({ where: { createdById: oldId }, data: { createdById: newId } }),
    prisma.timeEntry.updateMany({ where: { profileId: oldId }, data: { profileId: newId } }),
    prisma.notification.updateMany({ where: { recipientId: oldId }, data: { recipientId: newId } }),
    prisma.notification.updateMany({ where: { actorId: oldId }, data: { actorId: newId } }),
    prisma.pushSubscription.updateMany({ where: { userId: oldId }, data: { userId: newId } }),
    prisma.apiKey.updateMany({ where: { createdById: oldId }, data: { createdById: newId } }),
    prisma.profile.delete({ where: { id: oldId } }),
  ])
}

/**
 * Ensures a Profile row exists for the signed-in auth user and restores
 * soft-deleted accounts on re-login.
 */
export async function reconcileProfileOnLogin(user: {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown>
}) {
  if (!user.email) return

  const name = profileNameFromUser(user)

  let profile = await prisma.profile.findUnique({ where: { id: user.id } })
  if (profile) {
    if (profile.deletedAt) {
      // User was deleted by an admin. Restore the profile row (required for FK
      // integrity on old tickets/comments) but wipe everything back to defaults
      // so they re-enter the system as a completely fresh account.
      await prisma.profile.update({
        where: { id: user.id },
        data: {
          deletedAt: null,
          name,
          email: user.email,
          role: "agent",
          subDepartmentId: null,
          avatarUrl: null,
          timezone: null,
          notificationPrefs: undefined,
          preferences: {},
        },
      })
    }
    return
  }

  const byEmail = await prisma.profile.findUnique({ where: { email: user.email } })
  if (byEmail) {
    if (byEmail.deletedAt) {
      await migrateProfileAuthId(byEmail.id, user.id)
    }
    return
  }

  await prisma.profile.create({
    data: { id: user.id, email: user.email, name },
  })

  // First-time sign-in has no tenant to land in otherwise (no domain-based
  // or invite-token assignment exists on this path) — default new accounts
  // into the primary "pen" tenant so they're visible to admins/managers.
  const defaultTenant = await prisma.tenant.findUnique({ where: { slug: "pen" } })
  if (defaultTenant) {
    await prisma.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId: defaultTenant.id, userId: user.id } },
      update: {},
      create: { tenantId: defaultTenant.id, userId: user.id, role: "agent", isActive: true },
    })
  }
}
