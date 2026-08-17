import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

type Params = { params: Promise<{ id: string; inviteId: string }> };

async function canManageDept(
  profile: { role: string; managedDepartmentIds?: string[] },
  deptId: string,
): Promise<boolean> {
  if (profile.role === "admin") return true;
  if (profile.role === "manager") {
    return (profile.managedDepartmentIds ?? []).includes(deptId);
  }
  return false;
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { profile, error } = await requireAuth();
  if (error) return error;
  const { id: departmentId, inviteId } = await params;
  if (!(await canManageDept(profile!, departmentId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invite = await prisma.departmentInvite.findFirst({
    where: { id: inviteId, departmentId },
  });
  if (!invite) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (invite.acceptedAt) {
    return NextResponse.json({ error: "Invite already accepted" }, { status: 409 });
  }
  if (invite.revokedAt) {
    return NextResponse.json({ ok: true });
  }

  await prisma.departmentInvite.update({
    where: { id: inviteId },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
