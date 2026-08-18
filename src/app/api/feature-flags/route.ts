import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { listFeatureFlags } from "@/lib/feature-flags"

// SA-04 (UI half): the enabled/disabled state of every named feature for the
// caller's own active tenant, so the client can hide controls for disabled
// features. This is advisory only — every gated route must also call
// assertFeatureEnabled server-side; a hidden button is not the enforcement.
export async function GET() {
  const { profile, error } = await requireAuth()
  if (error) return error

  const tenantId = profile!.activeTenantId
  if (!tenantId) {
    return NextResponse.json({ flags: {} })
  }

  const flags = await listFeatureFlags(tenantId)
  return NextResponse.json({ flags })
}
