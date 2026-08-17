import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { contentTypeForFile } from "@/lib/mime"

const BUCKET = "attachments"
const MAX_FILE_BYTES = 20 * 1024 * 1024 // 20 MB

function sanitize(name: string) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 200)
}

// Returns a short-lived signed URL so the (public) intake form uploads bytes
// directly to Supabase Storage, bypassing the ~4.5 MB Vercel function body
// limit. Only tiny JSON passes through this route; the file never does.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const formId = typeof body.formId === "string" ? body.formId : ""
  const fileName = typeof body.fileName === "string" ? body.fileName : ""
  const size = Number(body.size)

  if (!formId || !fileName) {
    return NextResponse.json({ error: "formId and fileName are required" }, { status: 400 })
  }
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "Invalid file size" }, { status: 400 })
  }
  if (size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File must be under 20 MB" }, { status: 400 })
  }

  const path = `intake/${formId}/${Date.now()}-${sanitize(fileName)}`
  const supabase = createAdminClient()

  const { data: signed, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path)
  if (error || !signed) {
    return NextResponse.json({ error: error?.message ?? "Could not create upload URL" }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ path: signed.path, token: signed.token, publicUrl })
}
