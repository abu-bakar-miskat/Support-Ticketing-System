import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager, recruitmentBoardWhere, resolveActiveDeptId } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { badRequest, notFound } from "@/lib/api-response"
import { normalizeValuesPatch, mergeValues } from "@/lib/recruitment"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; candidateId: string }> },
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error
  const { id: boardId, candidateId } = await params
  const activeDeptId = await resolveActiveDeptId(profile)

  const candidate = await prisma.recruitmentCandidate.findFirst({
    where: { id: candidateId, boardId, board: recruitmentBoardWhere(profile, activeDeptId) },
    select: { id: true, values: true },
  })
  if (!candidate) return notFound("Candidate not found")

  const body = await request.json().catch(() => ({}))
  if (body.values === undefined) return badRequest("values is required")

  const fields = await prisma.recruitmentField.findMany({
    where: { boardId },
    select: { id: true, type: true, options: true },
  })
  const res = normalizeValuesPatch(fields, body.values)
  if (!res.ok) return badRequest(res.message)

  const merged = mergeValues(candidate.values, res.values)
  const updated = await prisma.recruitmentCandidate.update({
    where: { id: candidateId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { values: merged as any },
    select: { id: true, values: true, order: true, createdAt: true },
  })
  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; candidateId: string }> },
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error
  const { id: boardId, candidateId } = await params
  const activeDeptId = await resolveActiveDeptId(profile)

  const candidate = await prisma.recruitmentCandidate.findFirst({
    where: { id: candidateId, boardId, board: recruitmentBoardWhere(profile, activeDeptId) },
    select: { id: true },
  })
  if (!candidate) return notFound("Candidate not found")

  await prisma.recruitmentCandidate.delete({ where: { id: candidateId } })
  return NextResponse.json({ ok: true })
}
