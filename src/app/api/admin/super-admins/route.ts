import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireSuperAdmin } from "@/lib/auth"
import { recordAuditEvent } from "@/lib/audit-log"

/**
 * Platform Settings > Administrators — manage who carries Profile.isSuperAdmin
 * (the platform-wide role, distinct from a tenant's own "admin"). Every
 * handler re-requires super-admin so a just-demoted caller can't keep acting
 * on a stale session.
 */
export async function GET() {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const admins = await prisma.profile.findMany({
    where: { isSuperAdmin: true, deletedAt: null },
    select: { id: true, name: true, email: true, avatarUrl: true },
    orderBy: { name: "asc" },
  })
  return NextResponse.json({ admins })
}

export async function POST(request: NextRequest) {
  const { profile, error } = await requireSuperAdmin()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const userId = typeof body?.userId === "string" ? body.userId : ""
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
  if (!userId && !email) {
    return NextResponse.json({ error: "userId or email is required" }, { status: 400 })
  }

  // Super-admin is a platform-wide flag on an existing Profile, and a Profile
  // only exists once its owner has signed in (id is the Supabase auth uid).
  // So an invite-by-email can only be granted to someone who already has an
  // account — there's nothing to flag before that.
  const user = await prisma.profile.findFirst({
    where: userId ? { id: userId } : { email },
    select: { id: true, deletedAt: true, isSuperAdmin: true },
  })
  if (!user || user.deletedAt) {
    return NextResponse.json(
      {
        error: email
          ? "No account exists for this email yet. They must sign in once before they can be made a super admin."
          : "User not found",
      },
      { status: 404 },
    )
  }

  // Privileged-access change + its audit record are written together: if the
  // audit write fails, the grant is rolled back (accountability guarantee).
  const admin = await prisma.$transaction(async (tx) => {
    const updated = await tx.profile.update({
      where: { id: user.id },
      data: { isSuperAdmin: true },
      select: { id: true, name: true, email: true, avatarUrl: true },
    })
    await recordAuditEvent({
      tenantId: null, // platform-level role
      actorId: profile!.id,
      action: "SUPER_ADMIN_GRANTED",
      targetType: "Profile",
      targetId: user.id,
      before: { isSuperAdmin: user.isSuperAdmin },
      after: { isSuperAdmin: true },
      client: tx,
    })
    return updated
  })
  return NextResponse.json({ admin })
}

export async function DELETE(request: NextRequest) {
  const { profile, error } = await requireSuperAdmin()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const userId = typeof body?.userId === "string" ? body.userId : ""
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 })
  }
  if (userId === profile!.id) {
    return NextResponse.json({ error: "You can't remove your own super-admin access" }, { status: 400 })
  }

  const superAdminCount = await prisma.profile.count({ where: { isSuperAdmin: true, deletedAt: null } })
  if (superAdminCount <= 1) {
    return NextResponse.json({ error: "At least one super-admin must remain" }, { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.profile.update({ where: { id: userId }, data: { isSuperAdmin: false } })
    await recordAuditEvent({
      tenantId: null, // platform-level role
      actorId: profile!.id,
      action: "SUPER_ADMIN_REVOKED",
      targetType: "Profile",
      targetId: userId,
      before: { isSuperAdmin: true },
      after: { isSuperAdmin: false },
      client: tx,
    })
  })
  return NextResponse.json({ ok: true })
}
