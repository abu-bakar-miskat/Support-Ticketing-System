import { NextRequest, NextResponse } from "next/server";
import { requireAuth, assertTicketEditAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notify";
import { sendAssignmentEmail } from "@/lib/email";
import { assertAssigneeEligibleForTicket } from "@/lib/ticket-detail-data";
import { appendTicketEvent } from "@/lib/ticket-events";
import { ensureProjectMembers } from "@/lib/ensure-project-members";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const { id: ticketId } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      title: true,
      subDepartmentId: true,
      projectId: true,
      ticketNumber: true,
      assigneeId: true,
      tenantId: true,
      creatorId: true,
      deletedAt: true,
      subDepartment: { select: { departmentId: true, prefix: true } },
      assignees: { select: { userId: true } },
    },
  });
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const accessError = await assertTicketEditAccess(profile, ticket);
  if (accessError) return accessError;

  const body = await request.json().catch(() => ({}));
  const userId = body.userId as string;
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const eligibility = await assertAssigneeEligibleForTicket(ticket, userId);
  if (!eligibility.ok) {
    return NextResponse.json({ error: eligibility.error }, { status: 400 });
  }

  // Only act on actual new assignments (not re-adds of existing QA assignees)
  const existing = await prisma.ticketQaAssignee.findUnique({
    where: { ticketId_userId: { ticketId, userId } },
  });

  if (!existing) {
    const assignee = await prisma.profile.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });

    await prisma.ticketQaAssignee.create({ data: { ticketId, userId } });

    await ensureProjectMembers(ticket.projectId, [userId]);

    // Emit QA_ASSIGNEE_ADDED event — writes to ActivityLog and broadcasts in real-time
    await appendTicketEvent(ticketId, profile.id, "QA_ASSIGNEE_ADDED", {
      userId,
      userName: assignee?.name ?? userId,
    });

    await createNotification({
      recipientId: userId,
      actorId: profile.id,
      type: "qa_assignment",
      ticketId,
      message: ticket.title,
    });

    if (assignee?.email) {
      sendAssignmentEmail({
        to: assignee.email,
        assigneeName: assignee.name,
        assigneeId: assignee.id,
        ticketId,
        humanId: `${ticket.subDepartment.prefix}-${ticket.ticketNumber}`,
        ticketTitle: ticket.title,
        assignedByName: profile.name,
        assignedById: profile.id,
        departmentId: ticket.subDepartment.departmentId,
      }).catch((err) => console.error("[qa assignment email] failed:", err));
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const { id: ticketId } = await params;
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

  const body = await request.json().catch(() => ({}));
  const userId = body.userId as string;
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const assignee = await prisma.profile.findUnique({
    where: { id: userId },
    select: { id: true, name: true },
  });

  await prisma.ticketQaAssignee.deleteMany({ where: { ticketId, userId } });

  // Emit QA_ASSIGNEE_REMOVED event — real-time broadcast to all ticket viewers
  appendTicketEvent(ticketId, profile.id, "QA_ASSIGNEE_REMOVED", {
    userId,
    userName: assignee?.name ?? userId,
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
