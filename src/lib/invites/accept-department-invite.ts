import "server-only";
import { prisma } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";

export type AcceptInviteResult =
  | {
      ok: true;
      departmentId: string;
      departmentName: string;
      teamId: string;
      teamName: string;
      role: Role;
    }
  | {
      ok: false;
      code:
        | "not_found"
        | "expired"
        | "revoked"
        | "already_accepted"
        | "email_mismatch";
      message: string;
      inviteEmail?: string;
      signedInEmail?: string;
    };

export async function acceptDepartmentInvite(
  token: string,
  profile: { id: string; email: string },
): Promise<AcceptInviteResult> {
  const invite = await prisma.departmentInvite.findUnique({
    where: { token },
    include: {
      department: { select: { id: true, name: true } },
      team: { select: { id: true, name: true, departmentId: true } },
    },
  });

  if (!invite) {
    return { ok: false, code: "not_found", message: "This invitation link is invalid." };
  }
  if (invite.revokedAt) {
    return { ok: false, code: "revoked", message: "This invitation has been revoked." };
  }
  if (invite.acceptedAt) {
    return {
      ok: false,
      code: "already_accepted",
      message: "This invitation has already been accepted.",
    };
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return { ok: false, code: "expired", message: "This invitation has expired." };
  }

  const signedInEmail = profile.email.trim().toLowerCase();
  const inviteEmail = invite.email.trim().toLowerCase();
  if (signedInEmail !== inviteEmail) {
    return {
      ok: false,
      code: "email_mismatch",
      message: `You're signed in as ${profile.email}, but this invitation was sent to ${invite.email}.`,
      inviteEmail: invite.email,
      signedInEmail: profile.email,
    };
  }

  if (invite.team.departmentId !== invite.departmentId) {
    return { ok: false, code: "not_found", message: "This invitation link is invalid." };
  }

  await prisma.$transaction(async (tx) => {
    await (tx.teamMembership as any).upsert({
      where: { userId_teamId: { userId: profile.id, teamId: invite.teamId } },
      create: {
        userId: profile.id,
        teamId: invite.teamId,
        role: invite.role,
        isActive: true,
      },
      update: { role: invite.role, isActive: true },
    });

    await tx.profile.updateMany({
      where: { id: profile.id, teamId: null },
      data: { teamId: invite.teamId },
    });

    await tx.departmentInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    // Close any pending join requests for this user targeting the same team or department
    await tx.joinRequest.updateMany({
      where: {
        userId: profile.id,
        status: "pending",
        OR: [{ teamId: invite.teamId }, { departmentId: invite.departmentId }],
      },
      data: {
        status: "approved",
        processedAt: new Date(),
        processedBy: invite.invitedBy,
      },
    });
  });

  return {
    ok: true,
    departmentId: invite.department.id,
    departmentName: invite.department.name,
    teamId: invite.team.id,
    teamName: invite.team.name,
    role: invite.role,
  };
}

export async function getInvitePreview(token: string) {
  const invite = await prisma.departmentInvite.findUnique({
    where: { token },
    select: {
      email: true,
      role: true,
      message: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      department: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
      inviter: { select: { name: true } },
    },
  });
  return invite;
}
