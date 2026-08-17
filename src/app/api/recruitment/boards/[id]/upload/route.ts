import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager, recruitmentBoardWhere, resolveActiveDeptId } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { badRequest, notFound } from "@/lib/api-response"
import { createClient } from "@/lib/supabase/server"
import { contentTypeForFile, IMAGE_TYPES } from "@/lib/mime"

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB

/** CV-ish documents plus images. */
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "application/rtf",
  "text/plain",
  ...IMAGE_TYPES,
])

function sanitizeFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "file"
  return base.replace(/[^\w.\-()+ ]/g, "_").slice(0, 200) || "file"
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error
  const { id: boardId } = await params
  const activeDeptId = await resolveActiveDeptId(profile)

  const formData = await request.formData()
  const file = formData.get("file")
  const candidateId = formData.get("candidateId")

  if (typeof candidateId !== "string" || !candidateId) return badRequest("candidateId is required")
  if (!file || typeof file === "string") return badRequest("file is required")

  const contentType = contentTypeForFile(file.name, file.type)
  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: "Only PDF, Word, text, or image files are allowed" },
      { status: 415 },
    )
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File exceeds the 10 MB limit" }, { status: 413 })
  }

  const candidate = await prisma.recruitmentCandidate.findFirst({
    where: { id: candidateId, boardId, board: recruitmentBoardWhere(profile, activeDeptId) },
    select: { id: true },
  })
  if (!candidate) return notFound("Candidate not found")

  const storagePath = `recruitment/${boardId}/${candidateId}/${Date.now()}-${sanitizeFileName(file.name)}`
  const supabase = await createClient()
  const { data, error: uploadError } = await supabase.storage
    .from("attachments")
    .upload(storagePath, file, { upsert: false, contentType })
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("attachments").getPublicUrl(data.path)

  return NextResponse.json(
    { url: publicUrl, path: data.path, name: file.name, size: file.size },
    { status: 201 },
  )
}

/** Best-effort removal of a previously uploaded board file (replace/clear). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error
  const { id: boardId } = await params
  const activeDeptId = await resolveActiveDeptId(profile)

  const board = await prisma.recruitmentBoard.findFirst({
    where: { id: boardId, ...recruitmentBoardWhere(profile, activeDeptId) },
    select: { id: true },
  })
  if (!board) return notFound("Board not found")

  const body = await request.json().catch(() => ({}))
  const path = (body as { path?: unknown }).path
  const prefix = `recruitment/${boardId}/`
  if (typeof path !== "string" || !path.startsWith(prefix) || path.includes("..")) {
    return badRequest("path must be a file under this board")
  }

  const supabase = await createClient()
  await supabase.storage.from("attachments").remove([path])
  return NextResponse.json({ ok: true })
}
