import { prisma } from "@/lib/db"
import { mergeValues } from "@/lib/recruitment"
import { BASE_URL } from "@/lib/email-templates/_shared"

/**
 * Best-effort sync of screening progress onto the linked board candidate's
 * "Screening …" columns: Sent Date (invite created), Video (link to the
 * review page — recordings are behind presigned URLs, so the review page is
 * the stable target), and Score (AI overall, once scoring lands). Columns are
 * matched by name+type so boards without them are silently skipped, and a
 * failure never breaks the calling flow (invite send / scoring).
 */
export async function syncScreeningToBoard(sessionId: string): Promise<void> {
  try {
    const session = await prisma.screeningSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        createdAt: true,
        overallScore: true,
        candidate: { select: { id: true, boardId: true, values: true } },
      },
    })
    if (!session?.candidate) return

    const fields = await prisma.recruitmentField.findMany({
      where: { boardId: session.candidate.boardId },
      select: { id: true, name: true, type: true },
    })
    const find = (re: RegExp, type: string) =>
      fields.find((f) => f.type === type && re.test(f.name))
    const sentField = find(/screening.*sent/i, "date")
    const videoField = find(/screening.*video/i, "url")
    const scoreField = find(/screening.*score/i, "number")

    const patch: Record<string, unknown> = {}
    if (sentField) patch[sentField.id] = session.createdAt.toISOString().slice(0, 10)
    if (videoField) patch[videoField.id] = `${BASE_URL}/recruitment/screening/${session.id}`
    if (scoreField && session.overallScore !== null) patch[scoreField.id] = session.overallScore
    if (Object.keys(patch).length === 0) return

    await prisma.recruitmentCandidate.update({
      where: { id: session.candidate.id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { values: mergeValues(session.candidate.values, patch) as any },
    })
  } catch (err) {
    console.error("[screening] board sync failed:", sessionId, err)
  }
}
