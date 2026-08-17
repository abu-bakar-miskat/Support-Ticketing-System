import Link from "next/link"
import { redirect } from "next/navigation"
import { after } from "next/server"
import { Inbox, Video } from "lucide-react"
import { prisma } from "@/lib/db"
import { EMAIL_STATUS_META, refreshEmailStatuses } from "@/lib/screening/email-status"
import { retryStuckScoring } from "@/lib/screening/scoring"
import { r2UsageCached, refreshR2UsageIfStale } from "@/lib/screening/r2"

/** R2 free tier: 10 GB-month of storage. */
const R2_FREE_TIER_BYTES = 10_000_000_000

function formatBytes(bytes: number): string {
  const gb = bytes / 1_000_000_000
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 1 : 2)} GB`
  return `${Math.max(1, Math.round(bytes / 1_000_000))} MB`
}

// after() work can include a full scoring retry (transcription is 20-40s per
// answer) — don't let the page function's default limit kill it.
export const maxDuration = 300
import { getProfile } from "@/lib/profile"
import { screeningSessionWhere, recruitmentBoardWhere, resolveActiveDeptId } from "@/lib/auth"
import { PageHeader } from "@/components/ui/page-header"
import { RecruitmentTabs } from "@/components/recruitment/recruitment-tabs"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { AutoRefresh } from "./auto-refresh"
import { InviteForm } from "./invite-form"
import { RowActions } from "./row-actions"
import { HowItWorks } from "./how-it-works"

export const metadata = { title: "Screening — Ticketing System" }

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  sent: { label: "Sent", className: "bg-muted text-muted-foreground" },
  started: { label: "In progress", className: "bg-amber-500/15 text-amber-500" },
  submitted: { label: "Awaiting scoring", className: "bg-amber-500/15 text-amber-500" },
  scored: { label: "Ready to review", className: "bg-emerald-500/15 text-emerald-500" },
  expired: { label: "Expired", className: "bg-destructive/15 text-destructive" },
}

function scoreClass(score: number | null): string {
  if (score === null) return "text-muted-foreground"
  if (score >= 4) return "text-emerald-500"
  if (score >= 3) return "text-amber-500"
  return "text-destructive"
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("")
}

const PAGE_SIZE = 8

export default async function ScreeningQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; page?: string }>
}) {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (profile.role !== "admin" && profile.role !== "manager") redirect("/")

  const { view, page: pageParam } = await searchParams
  const showCompleted = view === "completed"
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1)

  const [sessions, completedCount, activeCount] = await Promise.all([
    prisma.screeningSession.findMany({
      where: {
        ...screeningSessionWhere(profile),
        completedAt: showCompleted ? { not: null } : null,
      },
      orderBy: showCompleted
        ? [{ completedAt: "desc" }]
        : [{ overallScore: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      include: { answers: { select: { flags: true, score: true, objectKey: true, gazeVerdict: true } } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.screeningSession.count({
      where: { ...screeningSessionWhere(profile), completedAt: { not: null } },
    }),
    prisma.screeningSession.count({
      where: { ...screeningSessionWhere(profile), completedAt: null },
    }),
  ])

  // Resolve "completed by" ids to names in one query for the Completed tab.
  const completerIds = [...new Set(sessions.map((s) => s.completedById).filter(Boolean))] as string[]
  const completers = completerIds.length
    ? await prisma.profile.findMany({ where: { id: { in: completerIds } }, select: { id: true, name: true } })
    : []
  const completerName = new Map(completers.map((p) => [p.id, p.name]))

  // Cached bucket sweep (at most every 30 min per instance) — null when R2
  // isn't configured or the first sweep hasn't completed yet.
  const storage = await r2UsageCached()

  // Boards for the shared Recruitment tab strip (same scoping as /recruitment).
  const activeDeptId = await resolveActiveDeptId(profile)
  const tabBoards = (
    await prisma.recruitmentBoard.findMany({
      where: { archivedAt: null, ...recruitmentBoardWhere(profile, activeDeptId) },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, _count: { select: { candidates: true } } },
    })
  ).map((b) => ({ id: b.id, name: b.name, candidateCount: b._count.candidates }))

  // After responding: poll Resend for invite delivery states, and re-kick
  // scoring for any session stuck in "submitted" (crash, deploy, transient
  // API failure). The 30s auto-refresh picks results up on the next cycle.
  after(() =>
    Promise.all([
      refreshEmailStatuses(sessions),
      retryStuckScoring(screeningSessionWhere(profile)),
      refreshR2UsageIfStale(),
    ]),
  )

  const tab = (active: boolean) =>
    cn(
      "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
      active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
    )

  const headCell = "text-muted-foreground py-3.5 text-xs font-medium tracking-wider uppercase"

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecruitmentTabs boards={tabBoards} />
      <div className="min-h-0 flex-1 overflow-y-auto">
      <AutoRefresh />
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader
          title="Video screening"
          description="The AI ranks the queue; a person decides. Scores order the list — nothing here rejects a candidate."
          icon={Video}
          actions={
            <div className="flex items-center gap-2">
              <HowItWorks />
              <Link
                href="/recruitment/screening/questions"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Edit questions
              </Link>
            </div>
          }
        />

        <div className="mt-6">
          <InviteForm />
        </div>

        <div className="mt-8 flex items-center gap-1.5">
          <Link href="/recruitment/screening" className={tab(!showCompleted)}>
            Active ({activeCount})
          </Link>
          <Link href="/recruitment/screening?view=completed" className={tab(showCompleted)}>
            Completed ({completedCount})
          </Link>
        </div>

        <div className="pen-glass-panel border-border mt-4 overflow-hidden rounded-2xl border">
          <Table className="text-[15px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(headCell, "pl-5")}>Candidate</TableHead>
                <TableHead className={headCell}>Role</TableHead>
                <TableHead className={headCell}>Status</TableHead>
                <TableHead className={headCell}>Score</TableHead>
                <TableHead className={headCell}>Flags</TableHead>
                <TableHead className={headCell}>Answers</TableHead>
                {showCompleted ? (
                  <TableHead className={headCell}>Completed</TableHead>
                ) : (
                  <TableHead className={headCell}>Invited</TableHead>
                )}
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="py-20 text-center">
                    <Inbox className="text-muted-foreground/60 mx-auto mb-3 h-8 w-8" strokeWidth={1.5} />
                    <p className="text-muted-foreground">
                      {showCompleted
                        ? "Nothing completed yet — finished reviews land here with who signed them off."
                        : "No active screenings — send an invite above, or check the Completed tab."}
                    </p>
                  </TableCell>
                </TableRow>
              )}
              {sessions.map((s) => {
                const flagCount = s.answers.reduce((n, a) => n + a.flags.length, 0)
                const uploaded = s.answers.filter((a) => a.objectKey).length
                const status = STATUS_STYLE[s.status] ?? STATUS_STYLE.sent
                return (
                  <TableRow key={s.id} className="pen-row-interactive">
                    <TableCell className="py-4 pl-5">
                      <Link href={`/recruitment/screening/${s.id}`} className="flex items-center gap-3">
                        <span className="bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                          {initials(s.candidateName)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {s.candidateName}
                          </span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {s.email}
                          </span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="py-4">{s.roleTitle}</TableCell>
                    <TableCell className="py-4">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
                          status.className,
                        )}
                      >
                        {status.label}
                      </span>
                      {s.answers.some((a) => a.gazeVerdict === "likely_reading" || a.gazeVerdict === "possible_reading") && (
                        <div
                          className={cn(
                            "mt-1.5 flex items-center gap-1.5 text-xs whitespace-nowrap",
                            s.answers.some((a) => a.gazeVerdict === "likely_reading")
                              ? "text-destructive"
                              : "text-amber-500",
                          )}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          Gaze check — verify video
                        </div>
                      )}
                      {s.reviewerFlaggedAt && (
                        <div
                          className="text-destructive mt-1.5 flex items-center gap-1.5 text-xs whitespace-nowrap"
                          title={s.reviewerFlagNote ?? undefined}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          Integrity flag
                        </div>
                      )}
                      {s.status === "submitted" &&
                        s.submittedAt &&
                        Date.now() - s.submittedAt.getTime() > 3 * 60_000 &&
                        s.answers.some((a) => a.objectKey && a.score === null) && (
                          <div className="mt-1.5 flex items-center gap-1.5 text-xs whitespace-nowrap text-amber-500">
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            Scoring stuck — auto-retrying
                          </div>
                        )}
                      {s.status === "sent" && s.emailStatus && EMAIL_STATUS_META[s.emailStatus] && (
                        <div
                          className={cn(
                            "mt-1.5 flex items-center gap-1.5 text-xs whitespace-nowrap",
                            EMAIL_STATUS_META[s.emailStatus].className,
                          )}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {EMAIL_STATUS_META[s.emailStatus].label}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-4 whitespace-nowrap">
                      {s.overallScore !== null ? (
                        <>
                          <span className={cn("text-lg font-semibold tabular-nums", scoreClass(s.overallScore))}>
                            {s.overallScore.toFixed(1)}
                          </span>
                          <span className="text-muted-foreground text-xs"> / 5</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-4 tabular-nums">
                      {flagCount > 0 ? (
                        <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-500">
                          {flagCount}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="py-4">
                      <span className="flex items-center gap-2.5">
                        {s.answers.length > 0 && s.answers.length <= 6 && (
                          <span className="flex items-center gap-1" aria-hidden>
                            {s.answers.map((a, i) => (
                              <span
                                key={i}
                                className={cn(
                                  "h-1.5 w-4 rounded-full",
                                  a.objectKey ? "bg-emerald-500/70" : "bg-muted-foreground/25",
                                )}
                              />
                            ))}
                          </span>
                        )}
                        <span className="text-muted-foreground text-xs tabular-nums whitespace-nowrap">
                          {uploaded} / {s.answers.length}
                        </span>
                      </span>
                    </TableCell>
                    {showCompleted ? (
                      <TableCell className="text-muted-foreground py-4 whitespace-nowrap">
                        {s.completedAt?.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        {s.completedById && (
                          <div className="text-xs">
                            by {completerName.get(s.completedById) ?? "unknown"}
                          </div>
                        )}
                      </TableCell>
                    ) : (
                      <TableCell className="text-muted-foreground py-4 whitespace-nowrap">
                        {s.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </TableCell>
                    )}
                    <TableCell className="py-4 pr-4 text-right whitespace-nowrap">
                      <RowActions
                        sessionId={s.id}
                        candidateName={s.candidateName}
                        completed={s.completedAt !== null}
                        screenToken={
                          s.status === "sent" || s.status === "started" ? s.token : undefined
                        }
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        {(() => {
          const total = showCompleted ? completedCount : activeCount
          const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
          if (totalPages <= 1) return null
          const href = (p: number) =>
            `/recruitment/screening?${showCompleted ? "view=completed&" : ""}page=${p}`
          const pageLink = (p: number, label: string, enabled: boolean) =>
            enabled ? (
              <Link href={href(p)} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                {label}
              </Link>
            ) : (
              <span className={cn(buttonVariants({ variant: "outline", size: "sm" }), "pointer-events-none opacity-40")}>
                {label}
              </span>
            )
          return (
            <div className="mt-4 flex items-center justify-between px-1">
              {pageLink(page - 1, "← Previous", page > 1)}
              <span className="text-muted-foreground text-xs">
                Page {Math.min(page, totalPages)} of {totalPages} · {total} candidates
              </span>
              {pageLink(page + 1, "Next →", page < totalPages)}
            </div>
          )
        })()}

        {storage && (
          <div className="text-muted-foreground mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs">
            <span className="font-medium">Storage</span>
            <span
              className="bg-muted relative h-1.5 w-36 overflow-hidden rounded-full"
              title={`${storage.objectCount} objects`}
            >
              <span
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full",
                  storage.totalBytes / R2_FREE_TIER_BYTES >= 0.9
                    ? "bg-destructive"
                    : storage.totalBytes / R2_FREE_TIER_BYTES >= 0.7
                      ? "bg-amber-500"
                      : "bg-emerald-500",
                )}
                style={{
                  width: `${Math.max(2, Math.min(100, (storage.totalBytes / R2_FREE_TIER_BYTES) * 100))}%`,
                }}
              />
            </span>
            <span className="tabular-nums">
              {formatBytes(storage.totalBytes)} of 10 GB free tier
            </span>
            {Object.entries(storage.byPrefix)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([prefix, bytes]) => (
                <span key={prefix} className="tabular-nums">
                  {prefix} {formatBytes(bytes)}
                </span>
              ))}
            <span>· recordings auto-delete after 90 days</span>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
