import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { badRequest, notFound } from "@/lib/api-response"

/**
 * Edit a bank question. Existing invites are unaffected — answers carry a
 * snapshot of the question as it was when the invite was sent.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdminOrManager()
  if (error) return error
  const { id } = await params

  const question = await prisma.screeningQuestion.findUnique({ where: { id } })
  if (!question) return notFound("Question not found.")

  const body = await request.json().catch(() => ({}))

  // Reorder: swap positions with the neighbour.
  if (body.move === "up" || body.move === "down") {
    const neighbour = await prisma.screeningQuestion.findFirst({
      where: body.move === "up" ? { position: { lt: question.position } } : { position: { gt: question.position } },
      orderBy: body.move === "up" ? { position: "desc" } : { position: "asc" },
    })
    if (neighbour) {
      await prisma.$transaction([
        prisma.screeningQuestion.update({ where: { id: question.id }, data: { position: neighbour.position } }),
        prisma.screeningQuestion.update({ where: { id: neighbour.id }, data: { position: question.position } }),
      ])
    }
    return NextResponse.json({ ok: true })
  }

  const data: Record<string, string | boolean> = {}
  const strFields = ["prompt", "hint", "rubricFive", "rubricThree", "rubricOne", "rubricPenalise"] as const
  for (const f of strFields) {
    if (typeof body[f] === "string") data[f] = body[f].trim()
  }
  if (data.prompt === "") return badRequest("The question text can't be empty.")
  if (typeof body.active === "boolean") data.active = body.active
  if (typeof body.alwaysInclude === "boolean") data.alwaysInclude = body.alwaysInclude

  if (Object.keys(data).length === 0) return badRequest("Nothing to update.")
  await prisma.screeningQuestion.update({ where: { id }, data })
  return NextResponse.json({ ok: true })
}

/** Delete a question that has never been asked; otherwise deactivate it. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdminOrManager()
  if (error) return error
  const { id } = await params

  const question = await prisma.screeningQuestion.findUnique({ where: { id }, select: { id: true } })
  if (!question) return notFound("Question not found.")

  const used = await prisma.screeningAnswer.count({ where: { questionKey: id } })
  if (used > 0) {
    await prisma.screeningQuestion.update({ where: { id }, data: { active: false } })
    return NextResponse.json({ ok: true, deactivated: true })
  }
  await prisma.screeningQuestion.delete({ where: { id } })
  return NextResponse.json({ ok: true, deleted: true })
}
