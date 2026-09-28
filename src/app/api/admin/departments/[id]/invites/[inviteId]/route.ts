import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { sendInviteEmail } from "@/lib/email";
import { INVITE_TTL_MS } from "@/lib/invites/constants";

type Params = { params: Promise<{ id: string; inviteId: string }> };

async function canManageDept(
  profile: { role: string; isSuperAdmin?: boolean; managedDepartmentIds?: string[] },
  deptId: string,
): Promise<boolean> {
  if (profile.isSuperAdmin) return true;
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

/** Resend a pending invite: refresh its expiry and re-send the email. */
export async function POST(_req: NextRequest, { params }: Params) {
  const { profile, error } = await requireAuth();
  if (error) return error;
  const { id: departmentId, inviteId } = await params;
  if (!(await canManageDept(profile!, departmentId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invite = await prisma.departmentInvite.findFirst({
    where: { id: inviteId, departmentId },
    include: {
      department: { select: { name: true } },
      subDepartment: { select: { name: true } },
    },
  });
  if (!invite) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (invite.acceptedAt) {
    return NextResponse.json({ error: "Invite already accepted" }, { status: 409 });
  }
  if (invite.revokedAt) {
    return NextResponse.json({ error: "Invite was revoked" }, { status: 409 });
  }

  // Push the expiry out so the resent link is valid for a fresh window, and reset
  // the reminder flag so the pending-reminder sweep can fire again.
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  await prisma.departmentInvite.update({
    where: { id: inviteId },
    data: { expiresAt, reminderSentAt: null },
  });

  try {
    await sendInviteEmail({
      to: invite.email,
      inviterName: profile!.name,
      inviterId: profile!.id,
      departmentId,
      departmentName: invite.department.name,
      subDepartmentName: invite.subDepartment.name,
      role: invite.role,
      message: invite.message,
      inviteToken: invite.token,
      expiresAt,
    });
  } catch (err) {
    console.error("[invites] failed to resend invite email:", err);
    return NextResponse.json({ error: "Failed to send invite email" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
