import { prisma } from "@/lib/db"
import { sendMentionEmail } from "@/lib/email"
import { createNotification } from "@/lib/notify"
import {
  getMentionableProjectMembers,
  getMentionableUsersForTicketDept,
} from "@/lib/mentionable-users"

export function parseMentionHandles(body: string): string[] {
  const matches = body.match(/@([\w.-]+)/g) ?? []
  return [...new Set(matches.map((m) => m.slice(1)))]
}

type MentionProfile = { id: string; email: string; name: string }

async function findProfileByHandle(handle: string): Promise<MentionProfile | null> {
  const nameVariant = handle.replace(/_/g, " ")
  return prisma.profile.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { email: { equals: handle, mode: "insensitive" } },
        { name: { equals: handle, mode: "insensitive" } },
        { name: { equals: nameVariant, mode: "insensitive" } },
      ],
    },
    select: { id: true, email: true, name: true },
  })
}

/** Resolve @handles in a comment body to profiles, expanding @all to department members. */
export async function resolveMentionedProfiles(
  body: string,
  ticketId: string,
): Promise<MentionProfile[]> {
  const handles = parseMentionHandles(body)
  if (!handles.length) return []

  const byId = new Map<string, MentionProfile>()

  if (handles.includes("all")) {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        subDepartmentId: true,
        projectId: true,
        subDepartment: { select: { departmentId: true } },
      },
    })
    if (ticket) {
      // @all targets the project's assigned members; if the ticket has no
      // project, fall back to everyone mentionable in the team/department.
      const mentionable = ticket.projectId
        ? await getMentionableProjectMembers(ticket.projectId)
        : await getMentionableUsersForTicketDept(
            ticket.subDepartment.departmentId,
            ticket.subDepartmentId,
          )
      if (mentionable.length) {
        const profiles = await prisma.profile.findMany({
          where: { id: { in: mentionable.map((u) => u.id) }, deletedAt: null },
          select: { id: true, email: true, name: true },
        })
        for (const p of profiles) byId.set(p.id, p)
      }
    }
  }

  for (const handle of handles) {
    if (handle === "all") continue
    const profile = await findProfileByHandle(handle)
    if (profile) byId.set(profile.id, profile)
  }

  return [...byId.values()]
}

export async function processMentions({
  commentId,
  ticketId,
  actorId,
  actorName,
  body,
  ticketTitle,
  alreadyNotifiedIds = [],
}: {
  commentId: string
  ticketId: string
  actorId: string
  actorName?: string
  body: string
  ticketTitle: string
  alreadyNotifiedIds?: string[]
}) {
  const profiles = await resolveMentionedProfiles(body, ticketId)
  if (!profiles.length) return

  const notifiedSet = new Set(alreadyNotifiedIds)
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { subDepartment: { select: { departmentId: true } } },
  })
  const departmentId = ticket?.subDepartment.departmentId ?? null

  for (const profile of profiles) {
    const existingMention = await prisma.mention.findFirst({
      where: { commentId, mentionedUserId: profile.id },
    })
    if (existingMention) continue

    await prisma.mention.create({
      data: { commentId, mentionedUserId: profile.id },
    })

    await prisma.activityLog.create({
      data: {
        ticketId,
        actorId,
        action: "MENTION",
        metadata: { mentionedName: profile.name, mentionedUserId: profile.id },
      },
    })

    await createNotification({
      recipientId: profile.id,
      actorId,
      type: "mention",
      ticketId,
      commentId,
      message: body.length > 140 ? `${body.slice(0, 137)}...` : body,
    })

    if (!notifiedSet.has(profile.id)) {
      sendMentionEmail({ to: profile.email, mentionedName: profile.name, mentionedUserId: profile.id, ticketId, ticketTitle, actorId, departmentId })
        .then(() =>
          prisma.mention.updateMany({
            where: { commentId, mentionedUserId: profile.id, notifiedAt: null },
            data: { notifiedAt: new Date() },
          }),
        )
        .catch((err) => console.error("[mention email] failed:", err))
    }
  }
}
