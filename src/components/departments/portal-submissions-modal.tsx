"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowUpRight, Inbox, Search, UserRound, X } from "lucide-react"
import { IntakeResponseValue, type IntakeResponseEntry } from "@/components/tickets/intake-card"
import {
  UI_PRIORITY_DOT_HEX,
  UI_PRIORITY_STYLE,
  statusDotColor,
  statusLabel,
  uiPriorityFromDb,
} from "@/components/board/board-types"
import { StatusPill } from "@/components/board/status-pill"
import { AvatarVisual } from "@/components/ui/user-avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type PortalSubmission = {
  id: string
  submitterName: string
  submitterEmail: string
  priority: string
  createdAt: string
  responses: IntakeResponseEntry[]
  ticketId: string | null
  ticketNumber: number | null
  ticketStatus: string | null
  ticketAssigneeName: string | null
  ticketAssigneeAvatarUrl: string | null
}

const DAY_MS = 86_400_000

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function dayLabel(iso: string) {
  const diff = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / DAY_MS)
  if (diff === 0) return "Today"
  if (diff === 1) return "Yesterday"
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: diff < 7 ? "long" : undefined,
    day: "numeric",
    month: "short",
    year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  })
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })
}

/** Today's rows read better as elapsed time; older rows keep the clock time. */
function rowTimeLabel(iso: string, isToday: boolean) {
  if (!isToday) return timeLabel(iso)
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

function fullTimestamp(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

function PriorityPill({ priority }: { priority: string }) {
  const style = UI_PRIORITY_STYLE[uiPriorityFromDb(priority)]
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-sans text-[11.5px] font-medium",
      style.pillBg,
      style.pillText,
    )}>
      <span className={cn("size-1.5 rounded-full", style.dot)} />
      {style.label}
    </span>
  )
}

function MetaCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-3 first:pl-0 sm:border-l sm:border-sts-card-border sm:first:border-l-0">
      <p className="font-sans text-[10px] font-semibold tracking-[0.08em] text-sts-subtle uppercase">{label}</p>
      <div className="mt-1.5 flex min-h-6 items-center">{children}</div>
    </div>
  )
}

function SubmissionDetail({ submission }: { submission: PortalSubmission }) {
  return (
    <article className="flex flex-col">
      <header className="flex items-start gap-3 border-b border-sts-card-border px-6 pt-5 pb-4">
        <AvatarVisual name={submission.submitterName} size={36} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-sans text-[15px] font-semibold tracking-[-0.01em] text-sts-foreground">
            {submission.submitterName}
          </h3>
          <p className="mt-0.5 truncate font-sans text-[12px] text-sts-muted">
            <a href={`mailto:${submission.submitterEmail}`} className="hover:text-sts-id hover:underline">
              {submission.submitterEmail}
            </a>
            <span className="text-sts-subtle"> · </span>
            <time dateTime={submission.createdAt} className="tabular-nums">{fullTimestamp(submission.createdAt)}</time>
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 border-b border-sts-card-border px-6 sm:grid-cols-3">
        <MetaCell label="Priority">
          <PriorityPill priority={submission.priority} />
        </MetaCell>
        <MetaCell label="Ticket">
          {submission.ticketId ? (
            <Link
              href={`/tickets/${submission.ticketId}`}
              className="group/ticket inline-flex min-w-0 items-center gap-1.5 rounded-md font-sans text-[12px] font-semibold text-sts-id focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-id/30"
            >
              #{submission.ticketNumber}
              {submission.ticketStatus && <StatusPill status={submission.ticketStatus} />}
              <ArrowUpRight className="size-3 shrink-0 transition-transform group-hover/ticket:-translate-y-px group-hover/ticket:translate-x-px" />
            </Link>
          ) : (
            <span className="font-sans text-[12px] text-sts-subtle">Not created</span>
          )}
        </MetaCell>
        <MetaCell label="Assignee">
          {submission.ticketAssigneeName ? (
            <span className="flex min-w-0 items-center gap-2">
              <AvatarVisual name={submission.ticketAssigneeName} avatarUrl={submission.ticketAssigneeAvatarUrl} size={20} />
              <span className="truncate font-sans text-[12px] text-sts-foreground">{submission.ticketAssigneeName}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 font-sans text-[12px] text-sts-subtle">
              <UserRound className="size-3.5" />
              Unassigned
            </span>
          )}
        </MetaCell>
      </div>

      <section aria-label="Answers" className="px-6 py-5">
        {submission.responses.length === 0 ? (
          <p className="font-sans text-[12.5px] text-sts-subtle">This submission has no answers.</p>
        ) : (
          <dl className="flex flex-col divide-y divide-sts-card-border/70">
            {submission.responses.map((response) => (
              <div key={response.fieldId} className="py-3.5 first:pt-0 last:pb-0">
                <dt className="mb-1.5 font-sans text-[11.5px] font-medium text-sts-muted">{response.label}</dt>
                <dd><IntakeResponseValue response={response} /></dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </article>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-1 p-3" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5 rounded-lg px-3 py-2.5">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-2.5 w-1/2" />
        </div>
      ))}
    </div>
  )
}

export function PortalSubmissionsModal({
  apiKeyId,
  formName,
  onClose,
}: {
  apiKeyId: string
  formName: string
  onClose: () => void
}) {
  const [submissions, setSubmissions] = useState<PortalSubmission[] | null>(null)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // On narrow screens the list and detail share one pane; this tracks which is showing.
  const [mobileDetail, setMobileDetail] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/settings/api-keys/${apiKeyId}/submissions`)
      .then(async (res) => {
        if (!res.ok) throw new Error()
        return res.json() as Promise<PortalSubmission[]>
      })
      .then((data) => {
        if (cancelled) return
        const rows = Array.isArray(data) ? data : []
        setSubmissions(rows)
        setSelectedId((current) => current ?? rows[0]?.id ?? null)
      })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [apiKeyId, reloadKey])

  const filtered = useMemo(() => {
    if (!submissions) return []
    const q = query.trim().toLowerCase()
    if (!q) return submissions
    return submissions.filter((s) =>
      s.submitterName.toLowerCase().includes(q)
      || s.submitterEmail.toLowerCase().includes(q)
      || (s.ticketNumber !== null && `#${s.ticketNumber}`.includes(q)),
    )
  }, [submissions, query])

  const groups = useMemo(() => {
    const out: { label: string; rows: PortalSubmission[] }[] = []
    for (const row of filtered) {
      const label = dayLabel(row.createdAt)
      const last = out[out.length - 1]
      if (last?.label === label) last.rows.push(row)
      else out.push({ label, rows: [row] })
    }
    return out
  }, [filtered])

  const selected = filtered.find((s) => s.id === selectedId) ?? filtered[0] ?? null

  const select = useCallback((id: string) => {
    setSelectedId(id)
    setMobileDetail(true)
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (mobileDetail) setMobileDetail(false)
        else onClose()
        return
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
      if ((event.target as HTMLElement | null)?.closest("[data-detail-pane]")) return
      if (!selected || filtered.length === 0) return
      event.preventDefault()
      const index = filtered.findIndex((s) => s.id === selected.id)
      const next = filtered[Math.min(filtered.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))]
      setSelectedId(next.id)
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-submission-id="${next.id}"]`)
        ?.scrollIntoView({ block: "nearest" })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [filtered, mobileDetail, onClose, selected])

  const total = submissions?.length ?? 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 sts-overlay-backdrop" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="portal-submissions-title"
        className="sts-glass-panel relative flex h-[min(80vh,46rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-sts-card-border shadow-2xl"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-sts-card-border px-5 py-3.5 sm:px-6">
          <div className="min-w-0">
            <h2 id="portal-submissions-title" className="sts-text-modal-title">Submissions</h2>
            <p className="mt-0.5 truncate font-sans text-[12px] text-sts-muted">
              {formName}
              {submissions && (
                <span className="tabular-nums text-sts-subtle"> · {total} total</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close submissions"
            className="rounded-full p-1.5 text-sts-subtle transition-colors hover:bg-sts-surface hover:text-sts-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-id/30"
          >
            <X className="size-4" />
          </button>
        </header>

        {error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="font-sans text-[13px] text-sts-foreground">Couldn&rsquo;t load submissions.</p>
            <button
              type="button"
              onClick={() => { setError(false); setReloadKey((k) => k + 1) }}
              className="inline-flex h-8 items-center rounded-lg border border-sts-card-border bg-sts-card px-3 font-sans text-[11.5px] font-semibold text-sts-foreground shadow-sm transition-colors hover:border-sts-id/35 hover:text-sts-id"
            >
              Try again
            </button>
          </div>
        ) : submissions !== null && total === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <span className="flex size-10 items-center justify-center rounded-xl bg-sts-surface text-sts-muted">
              <Inbox className="size-4" strokeWidth={1.8} />
            </span>
            <p className="mt-3 font-sans text-[13px] font-semibold text-sts-foreground">No submissions yet</p>
            <p className="mt-1 max-w-xs font-sans text-[12px] leading-relaxed text-sts-muted">
              Submissions sent through this connection&rsquo;s form will appear here.
            </p>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 md:grid-cols-[19rem_minmax(0,1fr)]">
            {/* List pane */}
            <div className={cn(
              "flex min-h-0 flex-col border-sts-card-border md:border-r md:bg-sts-surface/30",
              mobileDetail && "hidden md:flex",
            )}>
              <div className="shrink-0 border-b border-sts-card-border p-3">
                <label className="relative block">
                  <span className="sr-only">Search submissions</span>
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-sts-subtle" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search name, email, or #ticket"
                    disabled={submissions === null}
                    className="h-8 w-full rounded-lg border border-sts-card-border bg-sts-card pr-2.5 pl-8 font-sans text-[12px] text-sts-foreground placeholder:text-sts-subtle focus:border-sts-id/40 focus:outline-none focus:ring-2 focus:ring-sts-id/15 disabled:opacity-60"
                  />
                </label>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {submissions === null ? (
                  <ListSkeleton />
                ) : filtered.length === 0 ? (
                  <p className="px-4 py-8 text-center font-sans text-[12px] text-sts-muted">
                    No submissions match &ldquo;{query.trim()}&rdquo;.
                  </p>
                ) : (
                  <ul ref={listRef} className="pb-2">
                    {groups.map((group) => (
                      <li key={group.label}>
                        <div className="sticky top-0 z-10 flex items-center gap-2.5 px-4 pt-3.5 pb-2 backdrop-blur-md">
                          <h4 className={cn(
                            "font-sans text-[10px] font-semibold tracking-[0.08em] uppercase",
                            group.label === "Today" ? "text-sts-foreground" : "text-sts-subtle",
                          )}>
                            {group.label}
                          </h4>
                          <span aria-hidden className="h-px flex-1 bg-sts-card-border" />
                          <span className="font-sans text-[10.5px] tabular-nums text-sts-subtle">
                            {group.rows.length}
                          </span>
                        </div>
                        <ul className="flex flex-col gap-0.5 px-2">
                          {group.rows.map((row) => {
                            const active = row.id === selected?.id
                            const isToday = group.label === "Today"
                            const priority = uiPriorityFromDb(row.priority)
                            return (
                              <li key={row.id}>
                                <button
                                  type="button"
                                  data-submission-id={row.id}
                                  aria-current={active ? "true" : undefined}
                                  onClick={() => select(row.id)}
                                  className={cn(
                                    "group/row relative flex w-full flex-col gap-1 overflow-hidden rounded-lg py-2.5 pr-3 pl-[18px] text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-id/30",
                                    active
                                      ? "bg-sts-card shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-sts-card-border"
                                      : "hover:bg-sts-card/70",
                                  )}
                                >
                                  {/* Priority stripe: scan urgency down the list without reading. */}
                                  <span
                                    aria-hidden
                                    className={cn(
                                      "absolute inset-y-2.5 left-[7px] w-[3px] rounded-full transition-opacity",
                                      active ? "opacity-100" : "opacity-45 group-hover/row:opacity-80",
                                    )}
                                    style={{ backgroundColor: UI_PRIORITY_DOT_HEX[priority] }}
                                  />
                                  <span className="flex items-baseline justify-between gap-2">
                                    <span className={cn(
                                      "truncate font-sans text-[12.5px] text-sts-foreground",
                                      active ? "font-semibold" : "font-medium",
                                    )}>
                                      {row.submitterName}
                                    </span>
                                    <time
                                      dateTime={row.createdAt}
                                      title={fullTimestamp(row.createdAt)}
                                      className="shrink-0 font-sans text-[11px] tabular-nums text-sts-subtle"
                                    >
                                      {rowTimeLabel(row.createdAt, isToday)}
                                    </time>
                                  </span>
                                  <span className="flex items-center justify-between gap-2">
                                    <span className="truncate font-sans text-[11.5px] text-sts-muted">{row.submitterEmail}</span>
                                    {row.ticketId ? (
                                      <span
                                        className="flex shrink-0 items-center gap-1.5 font-sans text-[11px] font-medium tabular-nums text-sts-muted"
                                        title={row.ticketStatus ? statusLabel(row.ticketStatus) : undefined}
                                      >
                                        {row.ticketStatus && (
                                          <span
                                            aria-hidden
                                            className="size-1.5 rounded-full"
                                            style={{ backgroundColor: statusDotColor(row.ticketStatus) }}
                                          />
                                        )}
                                        #{row.ticketNumber}
                                      </span>
                                    ) : (
                                      <span className="shrink-0 font-sans text-[11px] text-sts-subtle">No ticket</span>
                                    )}
                                  </span>
                                  <span className="sr-only">
                                    {UI_PRIORITY_STYLE[priority].label} priority
                                    {row.ticketStatus ? `, ticket ${statusLabel(row.ticketStatus)}` : ""}
                                  </span>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Detail pane */}
            <div
              data-detail-pane
              className={cn("min-h-0 overflow-y-auto", !mobileDetail && "hidden md:block")}
            >
              <button
                type="button"
                onClick={() => setMobileDetail(false)}
                className="mx-6 mt-4 inline-flex items-center gap-1 font-sans text-[12px] font-medium text-sts-muted transition-colors hover:text-sts-foreground md:hidden"
              >
                <ArrowLeft className="size-3.5" />
                All submissions
              </button>
              {submissions === null ? (
                <div className="flex flex-col gap-4 px-6 py-6" aria-hidden>
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-9 rounded-full" />
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Skeleton className="h-3.5 w-40" />
                      <Skeleton className="h-3 w-64" />
                    </div>
                  </div>
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : selected ? (
                <SubmissionDetail key={selected.id} submission={selected} />
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
