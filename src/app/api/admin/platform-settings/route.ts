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

  if (body.devMode !== undefined) {
    if (typeof body.devMode !== "boolean") {
      return NextResponse.json({ error: "devMode must be a boolean" }, { status: 400 })
    }
    patch.devMode = body.devMode
  }

  if (body.newTenantFeatureDefaults !== undefined) {
    if (typeof body.newTenantFeatureDefaults !== "object" || body.newTenantFeatureDefaults === null) {
      return NextResponse.json({ error: "newTenantFeatureDefaults must be an object" }, { status: 400 })
    }
    // parseFeatureDefaults in the lib validates/whitelists keys — pass through.
    patch.newTenantFeatureDefaults = body.newTenantFeatureDefaults
  }

  if (body.otpEmailTemplate !== undefined) {
    if (body.otpEmailTemplate === null) {
      patch.otpEmailTemplate = null // reset to built-in default
    } else if (typeof body.otpEmailTemplate !== "object" || Array.isArray(body.otpEmailTemplate)) {
      return NextResponse.json({ error: "otpEmailTemplate must be an object or null" }, { status: 400 })
    } else {
      const { subject, bodyHtml } = body.otpEmailTemplate as Record<string, unknown>
      if (typeof subject !== "string" || !subject.trim()) {
        return NextResponse.json({ error: "OTP email subject cannot be empty" }, { status: 400 })
      }
      if (typeof bodyHtml !== "string" || !bodyHtml.trim()) {
        return NextResponse.json({ error: "OTP email body cannot be empty" }, { status: 400 })
      }
      patch.otpEmailTemplate = { subject, bodyHtml }
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  const updated = await setPlatformSettings(patch, profile!.id)
  return NextResponse.json(updated)
}
