import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { recordAuditEvent } from "@/lib/audit-log"

/**
 * Records a USER_LOGGED_OUT audit event for the current session. The browser
 * still performs the actual `supabase.auth.signOut()` afterwards — this route
 * exists only so the sign-out is captured server-side (the client can't write
 * audit rows). Best-effort: any failure here must not block the user leaving.
 */
export async function POST() {
  const { profile, error } = await requireAuth()
  if (error) return error

  await recordAuditEvent({
    tenantId: profile!.activeTenantId ?? null,
    actorId: profile!.id,
    action: "USER_LOGGED_OUT",
    targetType: "Profile",
    targetId: profile!.id,
  }).catch((err) => console.error("[logout] audit failed:", err))

  return NextResponse.json({ ok: true })
}
