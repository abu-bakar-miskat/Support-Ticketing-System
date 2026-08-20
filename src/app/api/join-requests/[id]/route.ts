import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { departmentIdInScope, subDepartmentInScope } from "@/lib/dept-scope";

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
      user: { select: { name: true, subDepartmentId: true } },
      subDepartment: { select: { id: true, name: true, departmentId: true } },
      department: { select: { name: true } },
    },
  });

  if (!joinRequest) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (joinRequest.status !== "pending") {
    return NextResponse.json({ error: "Already processed" }, { status: 409 });
  }

  const requestDeptId = joinRequest.subDepartment?.departmentId ?? joinRequest.departmentId;
  if (requestDeptId && !(await departmentIdInScope(profile, requestDeptId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { action, subDepartmentId } = body as { action: "approve" | "reject"; subDepartmentId?: string };

  if (action === "approve") {
    const resolvedSubDepartmentId = subDepartmentId ?? joinRequest.subDepartment?.id;
    if (!resolvedSubDepartmentId) {
      return NextResponse.json({ error: "teamId required to approve" }, { status: 400 });
    }
    if (!(await subDepartmentInScope(profile, resolvedSubDepartmentId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.$transaction([
      (prisma.subDepartmentMembership as any).upsert({
        where: { userId_subDepartmentId: { userId: joinRequest.userId, subDepartmentId: resolvedSubDepartmentId } },
        create: { userId: joinRequest.userId, subDepartmentId: resolvedSubDepartmentId, role: "agent", isActive: true },
        update: { role: "agent", isActive: true },
      }),
      prisma.joinRequest.update({
        where: { id: requestId },
        data: { status: "approved", processedAt: new Date(), processedBy: profile.id },
      }),
      prisma.profile.updateMany({
        where: { id: joinRequest.userId, subDepartmentId: null },
        data: { subDepartmentId: resolvedSubDepartmentId },
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
