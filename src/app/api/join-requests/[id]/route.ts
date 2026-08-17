import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { departmentIdInScope, teamInScope } from "@/lib/dept-scope";

// PATCH /api/join-requests/[id]  { action: "approve" | "reject", teamId?, role? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  if (profile.role !== "admin" && profile.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: requestId } = await params;

  const joinRequest = await prisma.joinRequest.findUnique({
    where: { id: requestId },
    include: {
      user: { select: { name: true, teamId: true } },
      team: { select: { id: true, name: true, departmentId: true } },
      department: { select: { name: true } },
    },
  });

  if (!joinRequest) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (joinRequest.status !== "pending") {
    return NextResponse.json({ error: "Already processed" }, { status: 409 });
  }

  const requestDeptId = joinRequest.team?.departmentId ?? joinRequest.departmentId;
  if (requestDeptId && !(await departmentIdInScope(profile, requestDeptId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { action, teamId } = body as { action: "approve" | "reject"; teamId?: string };

  if (action === "approve") {
    const resolvedTeamId = teamId ?? joinRequest.team?.id;
    if (!resolvedTeamId) {
      return NextResponse.json({ error: "teamId required to approve" }, { status: 400 });
    }
    if (!(await teamInScope(profile, resolvedTeamId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.$transaction([
      (prisma.teamMembership as any).upsert({
        where: { userId_teamId: { userId: joinRequest.userId, teamId: resolvedTeamId } },
        create: { userId: joinRequest.userId, teamId: resolvedTeamId, role: "staff", isActive: true },
        update: { role: "staff", isActive: true },
      }),
      prisma.joinRequest.update({
        where: { id: requestId },
        data: { status: "approved", processedAt: new Date(), processedBy: profile.id },
      }),
      prisma.profile.updateMany({
        where: { id: joinRequest.userId, teamId: null },
        data: { teamId: resolvedTeamId },
      }),
      prisma.notification.create({
        data: {
          recipientId: joinRequest.userId,
          actorId: profile.id,
          type: "join_request",
          joinRequestId: requestId,
          message: `approved: Your join request was approved.`,
        },
      }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.joinRequest.update({
        where: { id: requestId },
        data: { status: "rejected", processedAt: new Date(), processedBy: profile.id },
      }),
      prisma.notification.create({
        data: {
          recipientId: joinRequest.userId,
          actorId: profile.id,
          type: "join_request",
          joinRequestId: requestId,
          message: `rejected: Your join request was not approved.`,
        },
      }),
    ]);
  }

  return NextResponse.json({ ok: true });
}
