import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager, recruitmentBoardWhere, resolveActiveDeptId } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { badRequest, notFound } from "@/lib/api-response"
import { contentTypeForFile } from "@/lib/mime"
import { normalizeValue, parseFileValue, mergeValues } from "@/lib/recruitment"
import { cvExtractionConfigured, extractCvFields, findAssessmentFields } from "@/lib/recruitment-cv"

// Claude reads the whole document — give the route time.
export const maxDuration = 120

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
])

/**
 * Re-run the AI CV pass for an EXISTING candidate using the CV already
 * attached to their row: rewrites the Highlights / Concerns assessment
 * columns, and fills fact fields that are still empty (never overwrites a
 * human-entered value).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; candidateId: string }> },
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error
  const { id: boardId, candidateId } = await params
  const activeDeptId = await resolveActiveDeptId(profile)

  if (!cvExtractionConfigured()) {
    return NextResponse.json({ error: "AI analysis is not configured (ANTHROPIC_API_KEY missing)." }, { status: 503 })
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

  const candidate = await prisma.recruitmentCandidate.findFirst({
    where: { id: candidateId, boardId },
    select: { id: true, values: true },
  })
  if (!candidate) return notFound("Candidate not found")

  // Find the first file-field value that holds their CV.
  const candidateValues =
    typeof candidate.values === "object" && candidate.values !== null && !Array.isArray(candidate.values)
      ? (candidate.values as Record<string, unknown>)
      : {}
  const fileField = board.fields.find(
    (f) => f.type === "file" && parseFileValue(candidateValues[f.id]) !== null,
  )
  const cv = fileField ? parseFileValue(candidateValues[fileField.id]) : null
  if (!cv) return badRequest("This candidate has no CV attached — upload one to their file column first.")
  if (cv.size > MAX_FILE_BYTES) return badRequest("The attached CV exceeds the 10 MB limit.")

  const contentType = contentTypeForFile(cv.name, "")
  if (!ALLOWED_TYPES.has(contentType)) {
    return badRequest("Only PDF or image CVs can be analyzed. For Word documents, export as PDF first.")
  }

  const fileRes = await fetch(cv.url)
  if (!fileRes.ok) return badRequest("Couldn't download the attached CV.")
  const bytes = Buffer.from(await fileRes.arrayBuffer())

  let extraction
  try {
    extraction = await extractCvFields(bytes.toString("base64"), contentType, board.fields, board.name)
  } catch (err) {
    console.error("[recruitment] CV analysis failed:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't analyze the CV." },
      { status: 502 },
    )
  }

  const fieldById = new Map(board.fields.map((f) => [f.id, f]))
  const patch: Record<string, unknown> = {}

  // Fact fields: fill blanks only — a human-entered value always wins.
  for (const { fieldId, value } of extraction.fields) {
    const field = fieldById.get(fieldId)
    if (!field) continue
    const existing = candidateValues[fieldId]
    if (existing !== null && existing !== undefined && existing !== "") continue
    const res = normalizeValue(field, value)
    if (res.ok && res.value !== null) patch[fieldId] = res.value
  }

  // Assessment columns: always refreshed — that's the point of re-analyzing.
  const { highlightsField, concernsField } = findAssessmentFields(board.fields)
  if (highlightsField && extraction.assessment.highlights.trim()) {
    patch[highlightsField.id] = extraction.assessment.highlights.trim().slice(0, 1000)
  }
  if (concernsField) {
    // An empty concerns answer still means "reviewed and clean" — say so.
    patch[concernsField.id] = (extraction.assessment.concerns.trim() || "None noted").slice(0, 1000)
  }

  const updated = await prisma.recruitmentCandidate.update({
    where: { id: candidate.id },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { values: mergeValues(candidate.values, patch) as any },
    select: { id: true, values: true, order: true, createdAt: true },
  })

  return NextResponse.json({ candidate: updated, filled: Object.keys(patch).length })
}
