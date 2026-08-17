import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"

/** Save a push subscription for the authenticated user. */
export async function POST(request: NextRequest) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const body = await request.json().catch(() => null)
  const { endpoint, keys } = body ?? {}

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 })
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: profile.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { userId: profile.id, p256dh: keys.p256dh, auth: keys.auth },
  })

  return NextResponse.json({ ok: true })
}

/** Remove a push subscription (e.g. when user revokes permission). */
export async function DELETE(request: NextRequest) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const body = await request.json().catch(() => null)
  const { endpoint } = body ?? {}

  if (!endpoint) {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 })
  }

  await prisma.pushSubscription.deleteMany({
    where: { endpoint, userId: profile.id },
  })

  return NextResponse.json({ ok: true })
}
