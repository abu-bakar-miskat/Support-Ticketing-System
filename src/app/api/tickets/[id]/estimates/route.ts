import { creationEstimate } from "@/lib/ticket-estimates";
import { checkAndNotifyEstimateOverrun } from "@/lib/time-estimate-notify";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, assertTicketEditAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { appendTicketEvent } from "@/lib/ticket-events";
import { parseDueDatePayload } from "@/lib/ticket-datetime";

type TicketForEstimate = {
  id: string;
  subDepartmentId: string;
  projectId: string | null;
  assigneeId: string | null;
  estimatedTime: number | null;
  estimates: { userId: string }[];
  creatorId: string;
  deletedAt: Date | null;
  subDepartment: { departmentId: string | null };
  assignees: { userId: string }[];
};

async function loadTicket(ticketId: string): Promise<TicketForEstimate | null> {
  return prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      subDepartmentId: true,
      projectId: true,
      assigneeId: true,
      estimatedTime: true,
      estimates: { select: { userId: true } },
      tenantId: true,
      creatorId: true,
      deletedAt: true,
      subDepartment: { select: { departmentId: true } },
      assignees: { select: { userId: true } },
    },
  });
}

function assignedUserIds(ticket: TicketForEstimate): Set<string> {
  return new Set([
    ...(ticket.assigneeId ? [ticket.assigneeId] : []),
    ...ticket.assignees.map((a) => a.userId),
  ]);
}

/** Preserve the creation estimate when a co-assignee first adds their own. */
async function persistCreationEstimate(ticket: TicketForEstimate) {
  if (ticket.estimates.length) return;
  const initial = creationEstimate(ticket.assigneeId, ticket.estimatedTime);
  if (!initial) return;
  await prisma.ticketEstimate.createMany({
    data: [{ ticketId: ticket.id, ...initial }], skipDuplicates: true,
  });
}

/** Ticket-wide estimatedTime is the sum of everyone's personal estimate (null when none set). */
async function recomputeRollup(ticketId: string): Promise<number | null> {
  const agg = await prisma.ticketEstimate.aggregate({
    where: { ticketId, estimatedMinutes: { not: null } },
    _sum: { estimatedMinutes: true },
  });
  const total = agg._sum.estimatedMinutes;
  await prisma.ticket.update({
    where: { id: ticketId },
    data: { estimatedTime: total ?? null },
  });
  await checkAndNotifyEstimateOverrun(ticketId);
  return total ?? null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const { id: ticketId } = await params;
  const ticket = await loadTicket(ticketId);
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const targetUserId = (body.userId as string | undefined) || profile.id;

  // Only people actually assigned to the ticket can carry a personal estimate.
  if (!assignedUserIds(ticket).has(targetUserId)) {
    return NextResponse.json(
      { error: "User is not assigned to this ticket" },
      { status: 400 },
    );
  }

  // Assignees set their own; editing someone else's requires ticket-edit rights.
  if (targetUserId !== profile.id) {
    const accessError = await assertTicketEditAccess(profile, ticket);
    if (accessError) return accessError;
  }

  const rawMinutes = body.estimatedMinutes;
  const estimatedMinutes =
    rawMinutes === null || rawMinutes === undefined
      ? null
      : typeof rawMinutes === "number"
        ? Math.max(0, Math.round(rawMinutes))
        : null;

  const rawTarget = body.targetDate as string | null | undefined;
  const targetDate =
    rawTarget === null || rawTarget === undefined || rawTarget === ""
      ? null
      : parseDueDatePayload(rawTarget);

  await persistCreationEstimate(ticket);
  await prisma.ticketEstimate.upsert({
    where: { ticketId_userId: { ticketId, userId: targetUserId } },
    create: { ticketId, userId: targetUserId, estimatedMinutes, targetDate },
    update: { estimatedMinutes, targetDate },
  });

  const rollup = await recomputeRollup(ticketId);

  const target = await prisma.profile.findUnique({
    where: { id: targetUserId },
    select: { name: true },
  });

  await appendTicketEvent(ticketId, profile.id, "PERSONAL_ESTIMATE_CHANGED", {
    userId: targetUserId,
    userName: target?.name ?? targetUserId,
    estimatedMinutes,
    targetDate: targetDate ? targetDate.toISOString() : null,
  });

  return NextResponse.json({ ok: true, estimatedMinutes, rollup });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const { id: ticketId } = await params;
  const ticket = await loadTicket(ticketId);
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const targetUserId = (body.userId as string | undefined) || profile.id;

  if (targetUserId !== profile.id) {
    const accessError = await assertTicketEditAccess(profile, ticket);
    if (accessError) return accessError;
  }

  await persistCreationEstimate(ticket);
  await prisma.ticketEstimate.deleteMany({
    where: { ticketId, userId: targetUserId },
  });

  const rollup = await recomputeRollup(ticketId);

  const target = await prisma.profile.findUnique({
    where: { id: targetUserId },
    select: { name: true },
  });

  await appendTicketEvent(ticketId, profile.id, "PERSONAL_ESTIMATE_CHANGED", {
    userId: targetUserId,
    userName: target?.name ?? targetUserId,
    estimatedMinutes: null,
    targetDate: null,
  });

  return NextResponse.json({ ok: true, rollup });
}
