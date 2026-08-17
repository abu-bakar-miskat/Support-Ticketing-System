import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { badRequest } from "@/lib/api-response"
import { getAllQuestions } from "@/lib/screening/question-bank"

export async function GET() {
  const { error } = await requireAdminOrManager()
  if (error) return error
  return NextResponse.json({ questions: await getAllQuestions() })
}

/** Add a question to the bank. Rubric fields are optional but encouraged. */
export async function POST(request: NextRequest) {
  const { error } = await requireAdminOrManager()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : ""
  if (!prompt) return badRequest("The question text is required.")

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")
  const last = await prisma.screeningQuestion.findFirst({
    orderBy: { position: "desc" },
    select: { position: true },
  })

  const created = await prisma.screeningQuestion.create({
    data: {
      prompt,
      hint: str(body.hint),
      rubricFive: str(body.rubricFive),
      rubricThree: str(body.rubricThree),
      rubricOne: str(body.rubricOne),
      rubricPenalise: str(body.rubricPenalise),
      position: (last?.position ?? 0) + 1,
    },
    select: { id: true },
  })
  return NextResponse.json({ id: created.id }, { status: 201 })
}
