import { prisma } from "@/lib/db"
import { SCREENING_QUESTIONS } from "@/lib/screening/questions"

/**
 * DB-backed, editable question bank. The four spec questions in questions.ts
 * are only the seed — first read populates the table, and everything after
 * that (invites, candidate flow, scoring, review) uses the bank. Answers
 * snapshot prompt/hint/rubric at invite time, so editing the bank never
 * changes what an already-invited candidate sees.
 */

export type Rubric = { five: string; three: string; one: string; penalise: string }

export type BankQuestion = {
  id: string
  position: number
  prompt: string
  hint: string
  rubric: Rubric
  active: boolean
  alwaysInclude: boolean
}

type Row = {
  id: string
  position: number
  prompt: string
  hint: string
  rubricFive: string
  rubricThree: string
  rubricOne: string
  rubricPenalise: string
  active: boolean
  alwaysInclude: boolean
}

function toBankQuestion(row: Row): BankQuestion {
  return {
    id: row.id,
    position: row.position,
    prompt: row.prompt,
    hint: row.hint,
    rubric: {
      five: row.rubricFive,
      three: row.rubricThree,
      one: row.rubricOne,
      penalise: row.rubricPenalise,
    },
    active: row.active,
    alwaysInclude: row.alwaysInclude,
  }
}

async function seedIfEmpty(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const count = await tx.screeningQuestion.count()
    if (count > 0) return
    await tx.screeningQuestion.createMany({
      data: SCREENING_QUESTIONS.map((q) => ({
        position: q.position,
        prompt: q.prompt,
        hint: q.hint,
        rubricFive: q.rubric.five,
        rubricThree: q.rubric.three,
        rubricOne: q.rubric.one,
        rubricPenalise: q.rubric.penalise,
        // The location/hours question is mandatory screening — never rotated out.
        alwaysInclude: q.key === "logistics",
      })),
    })
  })
}

export async function getAllQuestions(): Promise<BankQuestion[]> {
  await seedIfEmpty()
  const rows = await prisma.screeningQuestion.findMany({ orderBy: { position: "asc" } })
  return rows.map(toBankQuestion)
}

export async function getActiveQuestions(): Promise<BankQuestion[]> {
  const all = await getAllQuestions()
  return all.filter((q) => q.active)
}

/** How many questions each invite gets (when the active bank is larger). */
export const QUESTIONS_PER_INVITE = 4

/**
 * Draw an invite's question set: every active `alwaysInclude` question, then a
 * random fill from the rest of the active bank, presented in bank order. With
 * a bank bigger than one invite, colleagues sharing questions stops paying off
 * — each candidate gets a different draw. Falls back to the whole active bank
 * while it's still small.
 */
export function drawInviteQuestions(
  active: BankQuestion[],
  count: number = QUESTIONS_PER_INVITE,
): BankQuestion[] {
  const pinned = active.filter((q) => q.alwaysInclude)
  const pool = active.filter((q) => !q.alwaysInclude)
  const fill = Math.max(0, count - pinned.length)
  const shuffled = [...pool]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return [...pinned, ...shuffled.slice(0, fill)].sort((a, b) => a.position - b.position)
}

export function parseRubricSnapshot(value: unknown): Rubric | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  return {
    five: typeof v.five === "string" ? v.five : "",
    three: typeof v.three === "string" ? v.three : "",
    one: typeof v.one === "string" ? v.one : "",
    penalise: typeof v.penalise === "string" ? v.penalise : "",
  }
}
