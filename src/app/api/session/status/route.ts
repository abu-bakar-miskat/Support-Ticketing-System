import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"

/**
 * SA-03: guaranteed fallback for "active sessions invalidated within 60
 * seconds" — the client polls this every ~25s (see
 * components/realtime/notifications-realtime.tsx) and force-signs-out on a
 * 401. The force_logout Realtime broadcast (lib/realtime-broadcast.ts) covers
 * the common case near-instantly; this covers a dropped/reconnecting socket.
 * requireAuth() already denies a restricted user or a member of a
 * suspended/deleted tenant via getProfile() — nothing else to check here.
 */
export async function GET() {
  const { error } = await requireAuth()
  if (error) return NextResponse.json({ ok: false }, { status: 401 })
  return NextResponse.json({ ok: true })
}
