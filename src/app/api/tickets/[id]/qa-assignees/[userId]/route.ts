import { NextRequest, NextResponse } from "next/server";
import { requireAuth, assertTicketEditAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const { id: ticketId, userId } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      subDepartmentId: true,
      projectId: true,
      assigneeId: true,
      tenantId: true,
      creatorId: true,
      deletedAt: true,
      subDepartment: { select: { departmentId: true } },
      assignees: { select: { userId: true } },
    },
  });
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const accessError = await assertTicketEditAccess(profile, ticket);
  if (accessError) return accessError;

  await prisma.ticketQaAssignee.deleteMany({ where: { ticketId, userId } });
  return new NextResponse(null, { status: 204 });
}
