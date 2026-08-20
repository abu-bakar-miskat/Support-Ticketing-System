import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { sendInviteEmail } from "@/lib/email";
import type { Role } from "@/generated/prisma/enums";

type Params = { params: Promise<{ id: string }> };

const INVITE_ROLES = new Set<Role>(["agent", "sub_manager"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

function serializeInvite(invite: {
  id: string;
  email: string;
  role: Role;
  message: string | null;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  subDepartment: { id: string; name: string };
  inviter: { id: string; name: string };
}) {
  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    message: invite.message,
    createdAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt.toISOString(),
    acceptedAt: invite.acceptedAt?.toISOString() ?? null,
    revokedAt: invite.revokedAt?.toISOString() ?? null,
    subDepartment: invite.subDepartment,
    inviter: invite.inviter,
  };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { profile, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  if (!(await canManageDept(profile!, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invites = await prisma.departmentInvite.findMany({
    where: {
      departmentId: id,
      revokedAt: null,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: {
      subDepartment: { select: { id: true, name: true } },
      inviter: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(invites.map(serializeInvite));
}

export async function POST(req: NextRequest, { params }: Params) {
  const { profile, error } = await requireAuth();
  if (error) return error;
  const { id: departmentId } = await params;
  if (!(await canManageDept(profile!, departmentId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const subDepartmentId = typeof body.subDepartmentId === "string" ? body.subDepartmentId : "";
  const roleRaw = typeof body.role === "string" ? body.role : "agent";
  const message =
    typeof body.message === "string" ? body.message.trim().slice(0, 2000) || null : null;

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (!subDepartmentId) {
    return NextResponse.json({ error: "teamId required" }, { status: 400 });
  }
  if (!INVITE_ROLES.has(roleRaw as Role)) {
    return NextResponse.json({ error: "role must be staff or lead" }, { status: 400 });
  }
  const role = roleRaw as Role;

  const [dept, subDepartment] = await Promise.all([
    prisma.department.findUnique({ where: { id: departmentId }, select: { id: true, name: true } }),
    prisma.subDepartment.findUnique({
      where: { id: subDepartmentId },
      select: { id: true, name: true, departmentId: true },
    }),
  ]);

  if (!dept) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!subDepartment || subDepartment.departmentId !== departmentId) {
    return NextResponse.json({ error: "Team not found in this department" }, { status: 400 });
  }

  const existingUser = await prisma.profile.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, deletedAt: null },
    select: { id: true, name: true },
  });
  if (existingUser) {
    return NextResponse.json(
      {
        error:
          "This email already has an account. Use Add member to add them to the department instead.",
      },
      { status: 409 },
    );
  }

  const existingPending = await prisma.departmentInvite.findFirst({
    where: {
      departmentId,
      subDepartmentId,
      email,
      revokedAt: null,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (existingPending) {
    return NextResponse.json(
      { error: "A pending invite already exists for this email and team" },
      { status: 409 },
    );
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  const invite = await prisma.departmentInvite.create({
    data: {
      token,
      email,
      departmentId,
      subDepartmentId,
      role,
      message,
      invitedBy: profile!.id,
      expiresAt,
    },
    include: {
      subDepartment: { select: { id: true, name: true } },
      inviter: { select: { id: true, name: true } },
    },
  });

  try {
    await sendInviteEmail({
      to: email,
      inviterName: profile!.name,
      inviterId: profile!.id,
      departmentId,
      departmentName: dept.name,
      subDepartmentName: subDepartment.name,
      role,
      message,
      inviteToken: token,
    });
  } catch (err) {
    console.error("[invites] failed to send invite email:", err);
    await prisma.departmentInvite.delete({ where: { id: invite.id } }).catch(() => null);
    return NextResponse.json({ error: "Failed to send invitation email" }, { status: 500 });
  }

  return NextResponse.json(serializeInvite(invite), { status: 201 });
}
