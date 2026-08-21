import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { getProfile } from "@/lib/profile"
import { screeningSessionWhere } from "@/lib/auth"
import { getQuestion } from "@/lib/screening/questions"
import { parseRubricSnapshot } from "@/lib/screening/question-bank"
import { presignR2Get, r2Configured } from "@/lib/screening/r2"
import { cn } from "@/lib/utils"
import { findRejectTargets } from "@/lib/screening/reject"
import { AutoRefresh } from "../auto-refresh"
import { RescoreButton } from "./rescore-button"
import { CompleteButton } from "./complete-button"
import { FlagButton } from "./flag-button"
import { RejectButton } from "./reject-button"

export const metadata = { title: "Screening review — Support Ticketing System" }

const FLAG_LABEL: Record<string, string> = {
  contradicts_cv: "Contradicts CV",
  no_specifics: "No specifics",
  sounds_scripted: "Sounds scripted",
  did_not_answer: "Didn't answer",
  location_risk: "Location risk",
  poor_audio: "Poor audio",
}

function scoreClass(score: number | null): string {
  if (score === null) return "text-muted-foreground"
  if (score >= 4) return "text-emerald-500"
  if (score >= 3) return "text-amber-500"
  return "text-destructive"
}

function scoreChipClass(score: number | null): string {
  if (score === null) return "bg-muted text-muted-foreground"
  if (score >= 4) return "bg-emerald-500/15 text-emerald-500"
  if (score >= 3) return "bg-amber-500/15 text-amber-500"
  return "bg-destructive/15 text-destructive"
}

export default async function ScreeningReviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (profile.role !== "admin" && profile.role !== "manager") redirect("/")

  const { id } = await params
  // Managers only see sessions they created; a foreign id 404s rather than leaks.
  const session = await prisma.screeningSession.findFirst({
    where: { id, ...screeningSessionWhere(profile) },
    include: {
      answers: { orderBy: { position: "asc" } },
      candidate: { select: { id: true, boardId: true, values: true } },
    },
  })
  if (!session) notFound()

  // Reject syncs to the recruitment table: only offered when the invite is
  // linked to a board candidate whose board has a stage column with a Reject
  // option (e.g. Stage → "Screening Rejected").
  let reject: {
    rejected: boolean
    stageLabel: string
    reasonOptions: { id: string; label: string }[]
  } | null = null
  if (session.candidate) {
    const fields = await prisma.recruitmentField.findMany({
      where: { boardId: session.candidate.boardId },
      select: { id: true, name: true, type: true, options: true },
    })
    const targets = findRejectTargets(fields)
    if (targets) {
      const values =
        typeof session.candidate.values === "object" &&
        session.candidate.values !== null &&
        !Array.isArray(session.candidate.values)
          ? (session.candidate.values as Record<string, unknown>)
          : {}
      reject = {
        rejected: values[targets.stageFieldId] === targets.rejectOption.id,
        stageLabel: targets.rejectOption.label,
        reasonOptions: targets.reasonOptions.map(({ id, label }) => ({ id, label })),
      }
    }
  }

  const videoUrls = new Map<string, string>()
  if (r2Configured()) {
    for (const a of session.answers) {
      if (a.objectKey) videoUrls.set(a.id, presignR2Get(a.objectKey, 3600))
    }
  }

  const flaggerName = session.reviewerFlaggedById
    ? ((
        await prisma.profile.findUnique({
          where: { id: session.reviewerFlaggedById },
          select: { name: true },
        })
      )?.name ?? null)
    : null

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* Refreshing re-mints presigned video URLs and resets playback, so only
          poll while we're still waiting on the candidate or the scorer. */}
      {(session.status === "sent" || session.status === "started" || session.status === "submitted") && (
        <AutoRefresh />
      )}
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <div className="mb-2">
          <Link
            href="/recruitment/screening"
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            ← Back to screening
          </Link>
        </div>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="pen-text-page-title">{session.candidateName}</h1>
            <p className="text-muted-foreground text-sm">
              {session.roleTitle} · {session.email}
              {session.submittedAt &&
                ` · submitted ${session.submittedAt.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="pen-text-stat-label">AI pre-score</div>
              <div className={cn("text-2xl font-bold tabular-nums", scoreClass(session.overallScore))}>
                {session.overallScore !== null ? `${session.overallScore.toFixed(1)} / 5` : "—"}
              </div>
            </div>
            <RescoreButton sessionId={session.id} />
            <FlagButton sessionId={session.id} flagged={session.reviewerFlaggedAt !== null} />
            <CompleteButton sessionId={session.id} completed={session.completedAt !== null} />
            {reject && (
              <RejectButton
                sessionId={session.id}
                rejected={reject.rejected}
                stageLabel={reject.stageLabel}
                reasonOptions={reject.reasonOptions}
                candidateEmail={session.email}
              />
            )}
          </div>
        </div>

        {session.reviewerFlaggedAt && (
          <p className="border-destructive/40 bg-destructive/10 text-destructive mb-6 rounded-lg border px-4 py-3 text-sm">
            <strong>Integrity flag</strong>
            {flaggerName ? ` by ${flaggerName}` : ""} on{" "}
            {session.reviewerFlaggedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            {session.reviewerFlagNote ? ` — ${session.reviewerFlagNote}` : ""}. The content score is
            unchanged; this records what the video showed.
          </p>
        )}

        {session.completedAt && (
          <p className="border-border text-muted-foreground mb-6 rounded-lg border px-4 py-3 text-sm">
            Completed {session.completedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            {" — this screening lives in the Completed tab. Reopen it to put it back in the active queue."}
          </p>
        )}

        <p className="text-muted-foreground border-border mb-6 rounded-lg border px-4 py-3 text-sm">
          Scores and transcripts cover <strong className="text-foreground">content only</strong> — spoken
          English is yours to judge from the video, and accent is never part of the score. The AI ranks;
          you decide.
        </p>

        <div className="space-y-6">
          {session.answers.map((answer) => {
            const legacy = getQuestion(answer.questionKey)
            const prompt = answer.prompt ?? legacy?.prompt ?? answer.questionKey
            const rubric = parseRubricSnapshot(answer.rubric) ?? legacy?.rubric ?? null
            const url = videoUrls.get(answer.id)
            return (
              <section
                key={answer.id}
                className="pen-glass-panel border-border overflow-hidden rounded-2xl border"
              >
                <div className="border-border flex items-start justify-between gap-4 border-b px-5 py-4">
                  <div>
                    <div className="pen-text-section-label">
                      Question {answer.position}
                      {answer.takesUsed > 1 && " · used retake"}
                      {answer.durationSec !== null && ` · ${answer.durationSec}s`}
                    </div>
                    <h2 className="mt-1 font-medium">{prompt}</h2>
                  </div>
                  <div
                    className={cn(
                      "shrink-0 rounded-lg px-3 py-1.5 text-lg font-bold tabular-nums",
                      scoreChipClass(answer.score),
                    )}
                  >
                    {answer.score !== null ? `${answer.score}/5` : "—"}
                  </div>
                </div>

                <div className="grid gap-5 p-5 lg:grid-cols-2">
                  <div>
                    {url ? (
                      <video controls preload="metadata" className="w-full rounded-lg bg-black" src={url} />
                    ) : (
                      <div className="text-muted-foreground border-border flex aspect-video items-center justify-center rounded-lg border text-sm">
                        {answer.objectKey ? "Video unavailable (R2 not configured)" : "Not answered"}
                      </div>
                    )}
                  </div>
                  <div className="space-y-4 text-sm">
                    {answer.gazeVerdict && answer.gazeVerdict !== "no_concern" && (
                      <div
                        className={cn(
                          "rounded-lg border px-3 py-2",
                          answer.gazeVerdict === "likely_reading"
                            ? "border-destructive/40 bg-destructive/10 text-destructive"
                            : "border-amber-500/40 bg-amber-500/10 text-amber-500",
                        )}
                      >
                        <span className="font-medium">
                          Gaze check: {answer.gazeVerdict === "likely_reading" ? "likely reading off-screen" : "possible reading off-screen"}
                        </span>
                        {" — verify on the video. "}
                        <span className="opacity-80">{answer.gazeReasoning}</span>
                      </div>
                    )}
                    {answer.flags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {answer.flags.map((f) => (
                          <span
                            key={f}
                            className="inline-flex rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-500"
                          >
                            {FLAG_LABEL[f] ?? f}
                          </span>
                        ))}
                      </div>
                    )}
                    {answer.reasoning && (
                      <div>
                        <div className="pen-text-section-label mb-1">Reasoning</div>
                        <p>{answer.reasoning}</p>
                      </div>
                    )}
                    {answer.evidence && (
                      <div>
                        <div className="pen-text-section-label mb-1">Evidence (verbatim)</div>
                        <blockquote className="border-primary border-l-2 pl-3 italic">
                          “{answer.evidence}”
                        </blockquote>
                      </div>
                    )}
                    {answer.transcript && (
                      <details>
                        <summary className="pen-text-section-label cursor-pointer">Full transcript</summary>
                        <p className="text-muted-foreground mt-2 leading-relaxed whitespace-pre-wrap">
                          {answer.transcript}
                        </p>
                      </details>
                    )}
                    {rubric && (rubric.five || rubric.three || rubric.one || rubric.penalise) && (
                      <details>
                        <summary className="pen-text-section-label cursor-pointer">Rubric</summary>
                        <dl className="text-muted-foreground mt-2 space-y-2">
                          {rubric.five && <div><dt className="inline font-semibold">5:</dt> <dd className="inline">{rubric.five}</dd></div>}
                          {rubric.three && <div><dt className="inline font-semibold">3:</dt> <dd className="inline">{rubric.three}</dd></div>}
                          {rubric.one && <div><dt className="inline font-semibold">1:</dt> <dd className="inline">{rubric.one}</dd></div>}
                          {rubric.penalise && <div><dt className="inline font-semibold">Penalise:</dt> <dd className="inline">{rubric.penalise}</dd></div>}
                        </dl>
                      </details>
                    )}
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
