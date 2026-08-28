import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"

/**
 * NFR-08: the signed-in user can download a machine-readable copy of the
 * personal data this workspace holds about them.
 */
export async function GET() {
  const { profile, error } = await requireAuth()
  if (error) return error
  const user = profile!

  const [memberships, ticketsCreated, comments, messages, intakes, timeEntries, notifications] =
    await Promise.all([
      prisma.tenantMembership.findMany({
        where: { userId: user.id },
        select: { role: true, isActive: true, createdAt: true, tenant: { select: { name: true, slug: true } } },
      }),
      prisma.ticket.findMany({
        where: { creatorId: user.id, deletedAt: null },
        select: { id: true, title: true, status: true, createdAt: true, ticketNumber: true },
        take: 500,
        orderBy: { createdAt: "desc" },
      }),
      prisma.comment.findMany({
        where: { authorId: user.id, deletedAt: null },
        select: { id: true, body: true, ticketId: true, createdAt: true },
        take: 500,
        orderBy: { createdAt: "desc" },
      }),
      prisma.ticketMessage.findMany({
        where: { authorProfileId: user.id },
        select: { id: true, ticketId: true, fromEmail: true, createdAt: true, direction: true },
        take: 500,
        orderBy: { createdAt: "desc" },
      }),
      prisma.intake.findMany({
        where: { submitterEmail: { equals: user.email, mode: "insensitive" } },
        select: {
          id: true,
          submitterName: true,
          submitterEmail: true,
          createdAt: true,
          formConfig: { select: { name: true } },
        },
        take: 200,
        orderBy: { createdAt: "desc" },
      }),
      prisma.timeEntry.findMany({
        where: { profileId: user.id },
        select: { id: true, ticketId: true, startedAt: true, endedAt: true, durationSecs: true },
        take: 500,
        orderBy: { startedAt: "desc" },
      }),
      prisma.notification.findMany({
        where: { recipientId: user.id },
        select: { id: true, type: true, message: true, createdAt: true, ticketId: true },
        take: 200,
        orderBy: { createdAt: "desc" },
      }),
    ])

  const payload = {
    exportedAt: new Date().toISOString(),
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      timezone: user.timezone,
      location: user.location,
      createdAt: user.createdAt,
    },
    memberships,
    ticketsCreated,
    comments,
    messages,
    intakes,
    timeEntries,
    notifications,
  }

  return NextResponse.json(payload, {
    headers: {
      "Content-Disposition": `attachment; filename="personal-data-export.json"`,
    },
  })
}
