import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager, recruitmentBoardWhere, resolveActiveDeptId } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { badRequest, notFound } from "@/lib/api-response"
import { createClient } from "@/lib/supabase/server"
import { contentTypeForFile } from "@/lib/mime"
import { normalizeValue } from "@/lib/recruitment"
import { cvExtractionConfigured, extractCvFields, findAssessmentFields } from "@/lib/recruitment-cv"

// Claude reads the whole document — give the route time.
export const maxDuration = 120

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB

/** Types Claude can read directly: PDF + images (screenshots of CVs happen). */
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
])

function sanitizeFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "cv"
  return base.replace(/[^\w.\-()+ ]/g, "_").slice(0, 200) || "cv"
}

/**
 * Drop a CV, get a filled-in candidate: Claude reads the file against the
 * board's own fields, the row is created with whatever the CV evidences, and
 * the file itself lands in the board's file field (if it has one).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error
  const { id: boardId } = await params
  const activeDeptId = await resolveActiveDeptId(profile)

  if (!cvExtractionConfigured()) {
    return NextResponse.json({ error: "AI extraction is not configured (ANTHROPIC_API_KEY missing)." }, { status: 503 })
  }

  const formData = await request.formData()
  const file = formData.get("file")
  if (!file || typeof file === "string") return badRequest("file is required")

  const contentType = contentTypeForFile(file.name, file.type)
  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: "Only PDF or image CVs can be auto-filled. For Word documents, export as PDF first." },
      { status: 415 },
    )
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File exceeds the 10 MB limit" }, { status: 413 })
  }

  const board = await prisma.recruitmentBoard.findFirst({
    where: { id: boardId, ...recruitmentBoardWhere(profile, activeDeptId) },
    select: {
      id: true,
      name: true,
      fields: {
        where: { hidden: false },
        orderBy: { order: "asc" },
        select: { id: true, name: true, type: true, options: true },
      },
    },
  })
  if (!board) return notFound("Board not found")

  const bytes = Buffer.from(await file.arrayBuffer())

  let extraction
  try {
    extraction = await extractCvFields(bytes.toString("base64"), contentType, board.fields, board.name)
  } catch (err) {
    console.error("[recruitment] CV extraction failed:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't read the CV." },
      { status: 502 },
    )
  }

  // Validate each extracted value independently — one bad value shouldn't
  // sink the whole candidate; it's just left blank for a human to fill.
  const fieldById = new Map(board.fields.map((f) => [f.id, f]))
  const values: Record<string, unknown> = {}
  const skipped: string[] = []
  for (const { fieldId, value } of extraction.fields) {
    const field = fieldById.get(fieldId)
    if (!field) continue
    const res = normalizeValue(field, value)
    if (res.ok && res.value !== null) values[fieldId] = res.value
    else skipped.push(field.name)
  }

  // AI first-pass assessment → Highlights / Concerns columns, when the board has them.
  const { highlightsField, concernsField } = findAssessmentFields(board.fields)
  if (highlightsField && extraction.assessment.highlights.trim()) {
    values[highlightsField.id] = extraction.assessment.highlights.trim().slice(0, 1000)
  }
  if (concernsField) {
    // An empty concerns answer still means "reviewed and clean" — say so.
    values[concernsField.id] = (extraction.assessment.concerns.trim() || "None noted").slice(0, 1000)
  }

  const last = await prisma.recruitmentCandidate.findFirst({
    where: { boardId },
    orderBy: { order: "desc" },
    select: { order: true },
  })

  const candidate = await prisma.recruitmentCandidate.create({
    data: {
      boardId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      values: values as any,
      order: (last?.order ?? -1) + 1,
      createdById: profile.id,
    },
    select: { id: true, values: true, order: true, createdAt: true },
  })

  // Attach the CV itself to the board's first file-type field, best effort.
  const fileField = await prisma.recruitmentField.findFirst({
    where: { boardId, type: "file", hidden: false },
    orderBy: { order: "asc" },
    select: { id: true },
  })
  if (fileField) {
    try {
      const storagePath = `recruitment/${boardId}/${candidate.id}/${Date.now()}-${sanitizeFileName(file.name)}`
      const supabase = await createClient()
      const { data, error: uploadError } = await supabase.storage
        .from("attachments")
        .upload(storagePath, file, { upsert: false, contentType })
      if (!uploadError && data) {
        const {
          data: { publicUrl },
        } = supabase.storage.from("attachments").getPublicUrl(data.path)
        const fileValue = { url: publicUrl, path: data.path, name: file.name, size: file.size }
        const updated = await prisma.recruitmentCandidate.update({
          where: { id: candidate.id },
          data: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            values: { ...(candidate.values as Record<string, unknown>), [fileField.id]: fileValue } as any,
          },
          select: { id: true, values: true, order: true, createdAt: true },
        })
        candidate.values = updated.values
      }
    } catch (err) {
      console.error("[recruitment] CV file attach failed (candidate still created):", err)
    }
  }

  return NextResponse.json(
    { candidate, filled: Object.keys(values).length, skipped },
    { status: 201 },
  )
}
