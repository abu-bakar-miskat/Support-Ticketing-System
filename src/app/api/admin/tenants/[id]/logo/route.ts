import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { badRequest } from "@/lib/api-response"
import { uploadTenantLogo } from "@/lib/storage"
import { getTenantConfig, updateTenantConfig } from "@/lib/tenant-config"

type Params = { params: Promise<{ id: string }> }

// Upload a logo image for a tenant (super-admin). Stores the public URL onto the
// tenant's branding.logoUrl and returns it.
export async function POST(request: Request, { params }: Params) {
  const { error } = await requireSuperAdmin()
  if (error) return error
  const { id } = await params

  const tenant = await getTenantConfig(id)
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) return badRequest("No file provided")

  let url: string
  try {
    ;({ url } = await uploadTenantLogo(id, file))
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Upload failed")
  }

  // Merge the new logo into existing branding without clobbering other fields.
  await updateTenantConfig(id, { branding: { logoUrl: url } })
  return NextResponse.json({ ok: true, url })
}
