import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager, screeningSessionWhere } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { badRequest, notFound } from "@/lib/api-response"
import { presignR2Delete, r2Configured } from "@/lib/screening/r2"
import { findRejectTargets } from "@/lib/screening/reject"
import { mergeValues } from "@/lib/recruitment"

/**
 * Reviewer actions. `{ completed: boolean }` stamps/clears the sign-off;
 * `{ flagged: boolean, note?: string }` stamps/clears the integrity flag (a
 * human's video-review verdict — e.g. reading answers off-screen — that the
 * transcript-only AI scorer cannot make); `{ reject: true, reasonOptionId? }`
 * sets the linked board candidate's stage to its Reject option (and optional
 * reject reason), then files the screening under Completed. Managers can only
 * touch invites they sent.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAdminOrManager(
    "Only admins and managers can update screening invites.",
  )
  if (error) return error
  const { id } = await params

  const body = await request.json().catch(() => ({}))
  const hasCompleted = typeof body.completed === "boolean"
  const hasFlagged = typeof body.flagged === "boolean"
  const hasReject = body.reject === true
  if (!hasCompleted && !hasFlagged && !hasReject) {
    return NextResponse.json(
      { error: "Expected { completed: boolean }, { flagged: boolean, note?: string } or { reject: true, reasonOptionId?: string }." },
      { status: 400 },
    )
  }

  const session = await prisma.screeningSession.findFirst({
    where: { id, ...screeningSessionWhere(profile) },
    select: {
      id: true,
      completedAt: true,
      candidate: { select: { id: true, boardId: true, values: true } },
    },
  })
  if (!session) return notFound("Session not found.")

  const data: Record<string, unknown> = {}
  if (hasCompleted) {
    Object.assign(
      data,
      body.completed
        ? { completedAt: new Date(), completedById: profile.id }
        : { completedAt: null, completedById: null },
    )
  }
  if (hasFlagged) {
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : ""
    Object.assign(
      data,
      body.flagged
        ? { reviewerFlaggedAt: new Date(), reviewerFlaggedById: profile.id, reviewerFlagNote: note || null }
        : { reviewerFlaggedAt: null, reviewerFlaggedById: null, reviewerFlagNote: null },
    )
  }

  let stageLabel: string | null = null
  if (hasReject) {
    // The session→candidate link is the authorization here: managers set it
    // themselves when sending the invite, and the session is already scoped.
    if (!session.candidate) {
      return badRequest("This screening isn't linked to a board candidate.")
    }
    const fields = await prisma.recruitmentField.findMany({
      where: { boardId: session.candidate.boardId },
      select: { id: true, name: true, type: true, options: true },
    })
    const targets = findRejectTargets(fields)
    if (!targets) {
      return badRequest("The candidate's board has no stage column with a Reject option.")
    }
    const patch: Record<string, unknown> = { [targets.stageFieldId]: targets.rejectOption.id }
    const reasonOptionId = typeof body.reasonOptionId === "string" ? body.reasonOptionId : null
    if (reasonOptionId && targets.reasonFieldId && targets.reasonOptions.some((o) => o.id === reasonOptionId)) {
      patch[targets.reasonFieldId] = reasonOptionId
    }
    await prisma.recruitmentCandidate.update({
      where: { id: session.candidate.id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { values: mergeValues(session.candidate.values, patch) as any },
    })
    stageLabel = targets.rejectOption.label
    // Rejecting is a decision — file the screening under Completed too.
    if (!session.completedAt && !hasCompleted) {
      Object.assign(data, { completedAt: new Date(), completedById: profile.id })
    }
  }

  if (Object.keys(data).length > 0) {
    await prisma.screeningSession.update({ where: { id: session.id }, data })
  }
  return NextResponse.json({ ok: true, ...(stageLabel ? { stageLabel } : {}) })
}

/**
 * Permanently delete a screening invite: recordings in R2 (best effort — the
 * 90-day lifecycle rule is the backstop), then the session + answers rows.
 * Managers can only delete invites they sent.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAdminOrManager(
    "Only admins and managers can delete screening invites.",
  )
  if (error) return error
  const { id } = await params

  const session = await prisma.screeningSession.findFirst({
    where: { id, ...screeningSessionWhere(profile) },
    include: { answers: { select: { objectKey: true, frameCount: true } } },
  })
  if (!session) return notFound("Session not found.")

  if (r2Configured()) {
    const keys = session.answers.flatMap((a) => {
      if (!a.objectKey) return []
      const frames = Array.from({ length: a.frameCount }, (_, i) =>
        (a.objectKey as string).replace(/\.(webm|mp4)$/, `-frame${i}.jpg`),
      )
      return [a.objectKey as string, ...frames]
    })
    await Promise.allSettled(
      keys.map((key) => fetch(presignR2Delete(key), { method: "DELETE" })),
    )
  }

  await prisma.screeningSession.delete({ where: { id: session.id } })
  return NextResponse.json({ ok: true })
}
