import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { forbidden, badRequest } from "@/lib/api-response"
import { uploadBrandingLogo } from "@/lib/storage"

// Shared logo-upload endpoint for every branding surface (tenant, department /
// sub-department email branding, public form design). It only stores the image
// and returns a public URL; binding that URL to a given scope happens on the
// respective branding save call, which enforces its own authorization.
export async function POST(request: Request) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const canUpload =
    profile.isSuperAdmin ||
    profile.role === "admin" ||
    profile.role === "manager"
  if (!canUpload) {
    return forbidden("You don't have permission to upload branding images.")
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) return badRequest("No file provided")

  const key = String(form?.get("key") ?? profile.activeTenantId ?? "shared")

  try {
    const { url } = await uploadBrandingLogo(key, file)
    return NextResponse.json({ ok: true, url })
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Upload failed")
  }
}
