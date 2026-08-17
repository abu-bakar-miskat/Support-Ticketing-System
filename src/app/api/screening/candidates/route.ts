import { NextResponse } from "next/server"
import { requireAdminOrManager, recruitmentBoardWhere, resolveActiveDeptId } from "@/lib/auth"
import { prisma } from "@/lib/db"

/**
 * Candidates from the caller's recruitment boards, for the invite form's
 * suggestion list. Board fields are user-defined, so name/email are resolved
 * heuristically: a text field named like "Name"/"Candidate" (else the first
 * text field in column order) and the first email-typed field (else a field
 * named like "email"). Each suggestion also carries triage state so a long
 * list stays scannable: `invited` (already has a screening invite, matched by
 * board link or email) and `rejected` (a select field named like
 * status/stage/decision has an option whose label contains "reject").
 */
export async function GET() {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error

  const activeDeptId = await resolveActiveDeptId(profile)
  const [boards, sessions] = await Promise.all([
    prisma.recruitmentBoard.findMany({
      where: { ...recruitmentBoardWhere(profile, activeDeptId), archivedAt: null },
      select: {
        name: true,
        fields: {
          orderBy: { order: "asc" },
          select: { id: true, name: true, type: true, options: true },
        },
        candidates: {
          orderBy: { createdAt: "desc" },
          take: 200,
          select: { id: true, values: true, screeningSessions: { select: { id: true }, take: 1 } },
        },
      },
    }),
    // Invites aren't always linked to a board candidate (free-typed invites),
    // so also match by email — and across all managers, since "already
    // invited" is true regardless of who sent it.
    prisma.screeningSession.findMany({ select: { email: true } }),
  ])

  const invitedEmails = new Set(sessions.map((s) => s.email.toLowerCase()).filter(Boolean))

  type Suggestion = {
    id: string
    name: string
    email: string
    board: string
    invited: boolean
    rejected: boolean
  }
  const suggestions: Suggestion[] = []

  for (const board of boards) {
    const nameField =
      board.fields.find((f) => f.type === "text" && /\b(name|candidate)\b/i.test(f.name)) ??
      board.fields.find((f) => f.type === "text")
    const emailField =
      board.fields.find((f) => f.type === "email") ??
      board.fields.find((f) => /e-?mail/i.test(f.name))
    if (!nameField) continue

    // Option ids whose label reads as a rejection, per status-like select field.
    const rejectOptionIds = new Map<string, Set<string>>()
    for (const f of board.fields) {
      if (!/status|stage|decision|outcome/i.test(f.name) || !Array.isArray(f.options)) continue
      const ids = new Set<string>()
      for (const opt of f.options as { id?: string; label?: string }[]) {
        if (opt?.id && typeof opt.label === "string" && /reject/i.test(opt.label)) ids.add(opt.id)
      }
      if (ids.size > 0) rejectOptionIds.set(f.id, ids)
    }

    for (const c of board.candidates) {
      const values = (c.values ?? {}) as Record<string, unknown>
      const name = typeof values[nameField.id] === "string" ? (values[nameField.id] as string).trim() : ""
      const email =
        emailField && typeof values[emailField.id] === "string"
          ? (values[emailField.id] as string).trim()
          : ""
      if (!name) continue

      let rejected = false
      for (const [fieldId, ids] of rejectOptionIds) {
        const v = values[fieldId]
        const chosen = Array.isArray(v) ? v : [v]
        if (chosen.some((x) => typeof x === "string" && (ids.has(x) || /reject/i.test(x)))) {
          rejected = true
          break
        }
      }

      suggestions.push({
        id: c.id,
        name,
        email,
        board: board.name,
        invited: c.screeningSessions.length > 0 || (!!email && invitedEmails.has(email.toLowerCase())),
        rejected,
      })
    }
  }

  // Actionable candidates first, already-invited next, rejected last.
  suggestions.sort((a, b) => {
    const rank = (s: Suggestion) => (s.rejected ? 2 : s.invited ? 1 : 0)
    return rank(a) - rank(b)
  })

  return NextResponse.json({ candidates: suggestions })
}
