import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requirePortalKeyAdmin } from "@/lib/portal-key-admin"

type StoredResponse = { fieldId?: string; label?: string; type?: string; value?: string }

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requirePortalKeyAdmin(id)
  if (auth.error || !auth.key) return auth.error

  const intakes = await prisma.intake.findMany({
    where: { apiKeyId: auth.key.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      submitterName: true,
      submitterEmail: true,
      priority: true,
      responses: true,
      createdAt: true,
      ticket: {
        select: {
          id: true,
          ticketNumber: true,
          status: true,
          deletedAt: true,
          assignee: { select: { name: true, avatarUrl: true } },
          tenant: { select: { slug: true } },
          subDepartment: { select: { department: { select: { slug: true } } } },
        },
      },
    },
  })

  return NextResponse.json(intakes.map((intake) => {
    const ticket = intake.ticket && !intake.ticket.deletedAt ? intake.ticket : null
    const responses = Array.isArray(intake.responses)
      ? (intake.responses as StoredResponse[])
          .filter((r) => r.fieldId && r.label && r.value)
          .map((r) => ({
            fieldId: r.fieldId as string,
            label: r.label as string,
            type: r.type ?? "text",
            value: r.value as string,
          }))
      : []
    return {
      id: intake.id,
      submitterName: intake.submitterName,
      submitterEmail: intake.submitterEmail,
      priority: intake.priority,
      createdAt: intake.createdAt.toISOString(),
      responses,
      ticketId: ticket?.id ?? null,
      ticketNumber: ticket?.ticketNumber ?? null,
      // Ticket pages are department-scoped; a bare /tickets/<id> from this
      // tenant-wide page has no department in the URL and bounces to the picker.
      ticketHref: ticket
        ? `/${ticket.tenant.slug}/${ticket.subDepartment.department.slug}/tickets/${ticket.id}`
        : null,
      ticketStatus: ticket?.status ?? null,
      ticketAssigneeName: ticket?.assignee?.name ?? null,
      ticketAssigneeAvatarUrl: ticket?.assignee?.avatarUrl ?? null,
    }
  }))
}
