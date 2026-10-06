import { randomBytes } from "node:crypto"
import { NextRequest } from "next/server"
import { runWithApiKeyScope } from "@/lib/api-key-auth"
import { prisma } from "@/lib/db"
import { contentTypeForFile, isAllowedUploadFile, MB } from "@/lib/mime"
import {
  cleanString,
  enforcePortalRateLimit,
  portalJson,
  requirePortalApiKey,
} from "@/lib/portal-api"
import { createAdminClient } from "@/lib/supabase/admin"

const BUCKET = "attachments"
/** Portal uploads are capped below the internal limits: one file per form field. */
const MAX_FILE_BYTES = 20 * MB

function sanitizeFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "file"
  return base.replace(/[^\w.\-()+ ]/g, "_").replace(/_{2,}/g, "_").slice(0, 120) || "file"
}

/**
 * Uploads one file for a `file` field on the key's support form and returns the
 * stored URL. The portal submits that URL as the field's value, the same way the
 * public intake form does. multipart/form-data: `file`, `fieldId`.
 */
export async function POST(request: NextRequest) {
  const { ctx, error } = await requirePortalApiKey(request, { write: true })
  if (error) return error
  const limited = enforcePortalRateLimit(request, ctx.keyId, 20, "upload")
  if (limited) return limited

  if (!/^multipart\/form-data\b/i.test(request.headers.get("content-type") ?? "")) {
    return portalJson({ error: "Content-Type must be multipart/form-data" }, { status: 415 })
  }
  const declared = Number(request.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > MAX_FILE_BYTES + 64 * 1024) {
    return portalJson({ error: "File must be under 20 MB" }, { status: 413 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return portalJson({ error: "Invalid multipart body" }, { status: 400 })
  }
  const fieldId = cleanString(form.get("fieldId"), 100)
  const file = form.get("file")
  if (!fieldId) return portalJson({ error: "fieldId is required" }, { status: 400 })
  if (!file || typeof file === "string") return portalJson({ error: "file is required" }, { status: 400 })
  if (file.size <= 0) return portalJson({ error: "File is empty" }, { status: 400 })
  if (file.size > MAX_FILE_BYTES) return portalJson({ error: "File must be under 20 MB" }, { status: 413 })
  if (!isAllowedUploadFile(file)) return portalJson({ error: "File type is not supported" }, { status: 415 })

  return runWithApiKeyScope(ctx, async () => {
    // Only `file` fields on this key's own active form accept uploads.
    const field = await prisma.intakeFormField.findFirst({
      where: {
        id: fieldId,
        type: "file",
        formConfig: { id: ctx.formConfigId!, isActive: true, department: { tenantId: ctx.tenantId } },
      },
      select: { id: true },
    })
    if (!field) return portalJson({ error: "Unknown file field" }, { status: 400 })

    const contentType = contentTypeForFile(file.name, file.type)
    // Unguessable path, namespaced by tenant and key.
    const path = `portal/${ctx.tenantId}/${ctx.keyId}/${Date.now()}-${randomBytes(12).toString("hex")}-${sanitizeFileName(file.name)}`
    const supabase = createAdminClient()
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: false, contentType })
    if (uploadError) return portalJson({ error: "Upload failed" }, { status: 502 })

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return portalJson(
      { data: { url: publicUrl, fileName: file.name, size: file.size, contentType } },
      { status: 201 },
    )
  })
}
