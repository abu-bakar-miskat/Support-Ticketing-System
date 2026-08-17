import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB

function sanitizeFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "file"
  return base.replace(/[^\w.\-()+ ]/g, "_").slice(0, 200) || "file"
}

// Returns a short-lived signed URL so the browser uploads bytes directly to
// Supabase Storage, bypassing the ~4.5 MB Vercel function body limit.
export async function POST(request: NextRequest) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const fileName = typeof body.fileName === "string" ? body.fileName : ""
  const size = Number(body.size)

  if (!fileName) {
    return NextResponse.json({ error: "fileName is required" }, { status: 400 })
  }
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "Invalid file size" }, { status: 400 })
  }
  if (size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File exceeds the 10 MB limit" }, { status: 413 })
  }

  const storagePath = `template-files/${profile.id}/${Date.now()}-${sanitizeFileName(fileName)}`

  const supabase = await createClient()
  const { data: signed, error: signErr } = await supabase.storage
    .from("attachments")
    .createSignedUploadUrl(storagePath)

  if (signErr || !signed) {
    return NextResponse.json({ error: signErr?.message ?? "Could not create upload URL" }, { status: 400 })
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("attachments").getPublicUrl(storagePath)

  return NextResponse.json({
    path: signed.path,
    token: signed.token,
    url: publicUrl,
    fileName,
  }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const path = searchParams.get("path")

  if (!path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 })
  }

  const supabase = await createClient()
  const { error: deleteError } = await supabase.storage
    .from("attachments")
    .remove([path])

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
