import { randomBytes } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireSuperAdmin } from "@/lib/auth"
import { recordAuditEvent } from "@/lib/audit-log"
import { sendSuperAdminInviteEmail } from "@/lib/email"
import { INVITE_TTL_MS } from "@/lib/invites/constants"

/**
 * Platform super-admin API — manage who carries Profile.isSuperAdmin
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
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 })
  }

  const user = await prisma.profile.findFirst({
    where: userId ? { id: userId } : { email },
    select: { id: true, deletedAt: true, isSuperAdmin: true },
  })
  if (!user || user.deletedAt) {
    // Grant-by-id can only elevate someone who already has an account.
    if (userId || !email) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // New email: do not create an auth user or Profile. Store the invite and
    // email the accept link. The account is created when they accept and sign in.
    const dup = await prisma.superAdminInvite.findFirst({
      where: { email, revokedAt: null, acceptedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    })
    if (dup) {
      return NextResponse.json({ error: "A pending invite already exists for this email" }, { status: 409 })
    }

    const token = randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
    await prisma.superAdminInvite.create({
      data: { token, email, invitedBy: profile!.id, expiresAt },
    })

    let emailDelivery: { status: "sent"; via: "mailpit" | "resend" } | { status: "failed" }
    try {
      const delivery = await sendSuperAdminInviteEmail({
        to: email,
        inviterName: profile!.name,
        inviterId: profile!.id,
        inviteToken: token,
        expiresAt,
      })
      emailDelivery = { status: "sent", via: delivery.via }
    } catch (err) {
      console.error("[super-admins] failed to send invite email:", err)
      emailDelivery = { status: "failed" }
    }

    return NextResponse.json(
      { invited: true, email, acceptPath: `/super-admin-invite/${token}`, emailDelivery },
      { status: 201 },
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
