import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireSuperAdmin } from "@/lib/auth"

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
  const { error } = await requireSuperAdmin()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const userId = typeof body?.userId === "string" ? body.userId : ""
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 })
  }

  const user = await prisma.profile.findUnique({
    where: { id: userId },
    select: { id: true, deletedAt: true },
  })
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const admin = await prisma.profile.update({
    where: { id: userId },
    data: { isSuperAdmin: true },
    select: { id: true, name: true, email: true, avatarUrl: true },
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

  await prisma.profile.update({ where: { id: userId }, data: { isSuperAdmin: false } })
  return NextResponse.json({ ok: true })
}
