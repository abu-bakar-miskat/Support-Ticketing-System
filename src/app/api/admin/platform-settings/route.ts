import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { getPlatformSettings, setPlatformSettings, type PlatformSettings } from "@/lib/platform-settings"

// Platform-wide global settings (super-admin only). GET returns the effective
// merged settings; PUT accepts a partial and persists only the provided fields.
export async function GET() {
  const { error } = await requireSuperAdmin()
  if (error) return error
  return NextResponse.json(await getPlatformSettings())
}

export async function PUT(request: Request) {
  const { profile, error } = await requireSuperAdmin()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const patch: Partial<PlatformSettings> = {}

  if (body.platformName !== undefined) {
    if (typeof body.platformName !== "string") {
      return NextResponse.json({ error: "platformName must be a string" }, { status: 400 })
    }
    if (!body.platformName.trim()) {
      return NextResponse.json({ error: "Platform name cannot be empty" }, { status: 400 })
    }
    patch.platformName = body.platformName
  }

  if (body.supportEmail !== undefined) {
    if (typeof body.supportEmail !== "string") {
      return NextResponse.json({ error: "supportEmail must be a string" }, { status: 400 })
    }
    const trimmed = body.supportEmail.trim()
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return NextResponse.json({ error: "Enter a valid support email" }, { status: 400 })
    }
    patch.supportEmail = trimmed
  }

  if (body.newTenantFeatureDefaults !== undefined) {
    if (typeof body.newTenantFeatureDefaults !== "object" || body.newTenantFeatureDefaults === null) {
      return NextResponse.json({ error: "newTenantFeatureDefaults must be an object" }, { status: 400 })
    }
    // parseFeatureDefaults in the lib validates/whitelists keys — pass through.
    patch.newTenantFeatureDefaults = body.newTenantFeatureDefaults
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  const updated = await setPlatformSettings(patch, profile!.id)
  return NextResponse.json(updated)
}
