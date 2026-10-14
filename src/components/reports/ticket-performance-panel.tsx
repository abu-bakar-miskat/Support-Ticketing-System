"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowDown, ArrowUp, ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Search, Trophy } from "lucide-react"
import { AvatarVisual } from "@/components/ui/user-avatar"
import { PERFORMANCE_METHOD, formatPerformanceDuration } from "@/lib/reporting/user-performance"
import type { ReportsOverview, SlaOutcomeCounts, UserPerformance } from "@/lib/api/reports"
import styles from "./report-layout.module.css"

function shortTime(seconds: number | null) {
  if (seconds === null) return "—"
  return formatPerformanceDuration(seconds).split(" ").slice(0, 2).join(" ")
}
function rate(met: number, breached: number) {
  return met + breached ? `${Math.round(met / (met + breached) * 100)}%` : "—"
}
function SlaCell({ counts }: { counts: SlaOutcomeCounts }) {
  return <>
    <div className={styles.sla}>
      <span className={styles.good} title="Met"><i className={styles.dot} aria-hidden="true" /><b className={styles.number}>{counts.met}</b><span className="sr-only"> met</span></span>
      <span className={counts.breached ? styles.bad : "text-sts-muted"} title="Breached"><i className={styles.dot} aria-hidden="true" /><b className={styles.number}>{counts.breached}</b><span className="sr-only"> breached</span></span>
    </div>
    <div className={styles.hint}>{counts.pending || counts.noPolicy ? `${counts.pending} pending · ${counts.noPolicy} no policy` : `${rate(counts.met, counts.breached)} met`}</div>
  </>
}

const PAGE_SIZE = 12
const priorityLabels = ["Urgent", "Critical", "High", "Medium", "Low"]
type SortKey = "score" | "completed" | "avgReplySecs" | "avgCompletionSecs"

function SortHeader({ label, column, sort, onSort }: {
  label: string; column: SortKey; sort: { key: SortKey; ascending: boolean }; onSort: (column: SortKey) => void
}) {
  const active = sort.key === column
  return <button type="button" className={styles.sort} onClick={() => onSort(column)}>
    {label}{active ? sort.ascending ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : null}
  </button>
}

export function TicketPerformancePanel({ overview, onSelectPerson }: {
  overview: ReportsOverview
  onSelectPerson?: (id: string) => void
}) {
  const [search, setSearch] = useState("")
  const [ticketSearch, setTicketSearch] = useState("")
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({ key: "score", ascending: false })
  const people = overview.userPerformance.filter((person) => person.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => {
    const first = a[sort.key], second = b[sort.key]
    if (first === null) return second === null ? a.name.localeCompare(b.name) : 1
    if (second === null) return -1
    return (first - second) * (sort.ascending ? 1 : -1) || b.completed - a.completed || a.name.localeCompare(b.name)
  })
  const tickets = overview.performanceDetails
  const completed = tickets.filter((ticket) => ticket.completedAt)
  const responseMet = tickets.filter((ticket) => ticket.responseSla === "Met").length
  const responseBreached = tickets.filter((ticket) => ticket.responseSla === "Breached").length
  const resolutionMet = tickets.filter((ticket) => ticket.resolutionSla === "Met").length
  const resolutionBreached = tickets.filter((ticket) => ticket.resolutionSla === "Breached").length
  const completionTimes = completed.flatMap((ticket) => ticket.completionSecs === null ? [] : [ticket.completionSecs])
  const avgCompletion = completionTimes.length ? completionTimes.reduce((sum, value) => sum + value, 0) / completionTimes.length : null
  const top = overview.userPerformance.find((person) => person.rank !== null)
  const sources = [["Custom / manual", overview.ticketSources.manual], ["Support", overview.ticketSources.support], ["Portal", overview.ticketSources.portal], ["Shared mailbox", overview.ticketSources.mailbox]] as const
  const priorities = priorityLabels.map((label) => ({ label, count: completed.filter((ticket) => ticket.priority === label).length }))
  const filteredTickets = tickets.filter((ticket) => `${ticket.ticket} ${ticket.title} ${ticket.people}`.toLowerCase().includes(ticketSearch.toLowerCase()))
  const maxPage = Math.max(0, Math.ceil(filteredTickets.length / PAGE_SIZE) - 1)
  const currentPage = Math.min(page, maxPage)
  const visibleTickets = filteredTickets.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
  const changeSort = (column: SortKey) => setSort({ key: column, ascending: sort.key === column ? !sort.ascending : column.startsWith("avg") })
  const selectPerson = (person: UserPerformance) => { if (person.personId) onSelectPerson?.(person.personId) }
  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Performance overview" className={styles.surface}>
        <div className={styles.metrics}>
          {[
            { label: "Tickets completed", value: completed.length, hint: "Completed in the selected period" },
            { label: "Response SLA met", value: rate(responseMet, responseBreached), hint: `${responseMet} met · ${responseBreached} breached` },
            { label: "Resolution SLA met", value: rate(resolutionMet, resolutionBreached), hint: `${resolutionMet} met · ${resolutionBreached} breached` },
            { label: "Avg. completion time", value: shortTime(avgCompletion), hint: `${completionTimes.length} measured tickets · elapsed time` },
          ].map((metric) => <div className={styles.metric} key={metric.label}>
            <p className={styles.label}>{metric.label}</p><p className={styles.metricValue}>{metric.value}</p><p className={styles.hint}>{metric.hint}</p>
          </div>)}
        </div>
        <div className={styles.sources}>
          <div className={styles.source}><span className="text-sts-muted">Tickets created</span><span className={styles.sourceNumber}>{overview.totals.total}</span></div>
          {sources.map(([label, count]) => <div className={styles.source} key={label}><span className="text-sts-muted">{label}</span><span className={styles.sourceNumber}>{count}</span></div>)}
        </div>
      </section>

      <section className={`${styles.surface} ${styles.spotlight}`} aria-label="Performance highlights">
        <div className={styles.spotlightBody}>
          <div className="flex items-center justify-between"><h2 className={styles.label}>Performance spotlight</h2><Trophy size={16} className="text-sts-blue" strokeWidth={1.6} /></div>
          {top ? <>
            <div className="mt-5 flex items-center gap-3">
              <AvatarVisual name={top.name} avatarUrl={overview.memberOptions.find((p) => p.id === top.personId)?.avatarUrl} size={44} />
              <div className="min-w-0 flex-1"><button type="button" disabled={!onSelectPerson || !top.personId} onClick={() => selectPerson(top)} className="flex max-w-full items-center gap-2 text-left text-lg font-semibold tracking-tight hover:text-sts-blue disabled:hover:text-sts-foreground"><span className="truncate">{top.name}</span>{onSelectPerson && <ArrowUpRight size={15} />}</button><p className={styles.subtitle}>Rank #{top.rank} · {top.completed} tickets completed</p></div>
              <div className="text-right"><span className="text-2xl font-semibold tabular-nums tracking-tight">{top.score}</span><p className={styles.hint}>out of 100</p></div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-sts-card-border pt-4 text-xs"><span className="text-sts-muted">Resolution SLA <b className="ml-1 text-sts-foreground">{rate(top.resolutionSla.met, top.resolutionSla.breached)}</b></span><span className="text-sts-muted">Avg. reply <b className="ml-1 text-sts-foreground">{shortTime(top.avgReplySecs)}</b></span><span className={styles.bad}>{top.responseSla.breached + top.resolutionSla.breached} SLA breaches</span></div>
          </> : <div className="mt-5"><p className="text-base font-medium">No ranking yet</p><p className={`${styles.subtitle} max-w-sm`}>Completed tickets with measured SLA results are needed to compare performance.</p></div>}
        </div>
        <div className={styles.spotlightBody}>
          <div className="flex items-center justify-between"><h2 className={styles.label}>Completions by priority</h2><span className="text-xs tabular-nums text-sts-muted">{completed.length} tickets</span></div>
          {priorities.map((priority) => <div key={priority.label} className={styles.priorityRow}><span className="text-sts-muted">{priority.label}</span><div className={styles.priorityTrack}><div className={styles.priorityBar} style={{ width: `${completed.length ? priority.count / completed.length * 100 : 0}%` }} /></div><span className="text-right tabular-nums font-medium">{priority.count}</span></div>)}
        </div>
      </section>

      <section className={styles.surface} aria-label="User performance">
        <div className={styles.sectionHeader}>
          <div><h2 className={styles.title}>User performance <span className="ml-2 text-xs font-normal text-sts-muted">{overview.userPerformance.length} people</span></h2><p className={styles.subtitle}>Compare delivery, SLA reliability, and response speed.</p></div>
          <div className={styles.toolbar}><label className={styles.search}><Search size={15} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a person…" aria-label="Search people in report" /></label></div>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <caption className="sr-only">User performance rankings, assigned and completed tickets, separate SLA outcomes, and average durations</caption>
            <thead><tr>
              <th scope="col" className={styles.personCell}>Person / rank</th><th scope="col">Assigned</th>
              <th scope="col" aria-sort={sort.key === "completed" ? sort.ascending ? "ascending" : "descending" : "none"}><SortHeader label="Completed" column="completed" sort={sort} onSort={changeSort} /></th>
              <th scope="col">Response SLA <span className="mt-1 block text-[10px] font-normal">Met / breached</span></th><th scope="col">Resolution SLA <span className="mt-1 block text-[10px] font-normal">Met / breached</span></th>
              <th scope="col" aria-sort={sort.key === "avgReplySecs" ? sort.ascending ? "ascending" : "descending" : "none"}><SortHeader label="Avg. reply" column="avgReplySecs" sort={sort} onSort={changeSort} /></th>
              <th scope="col" aria-sort={sort.key === "avgCompletionSecs" ? sort.ascending ? "ascending" : "descending" : "none"}><SortHeader label="Avg. completion" column="avgCompletionSecs" sort={sort} onSort={changeSort} /></th>
              <th scope="col" aria-sort={sort.key === "score" ? sort.ascending ? "ascending" : "descending" : "none"}><SortHeader label="Score" column="score" sort={sort} onSort={changeSort} /></th>
            </tr></thead>
            <tbody>{people.map((person) => <tr key={person.personId ?? "unassigned"}>
              <th scope="row" className={styles.personCell}><div className={styles.person}>
                <span className={`${styles.rank} ${person.rank === 1 ? styles.topRank : ""}`}>{person.rank ? String(person.rank).padStart(2, "0") : "—"}</span>
                <AvatarVisual name={person.name} avatarUrl={overview.memberOptions.find((p) => p.id === person.personId)?.avatarUrl} size={30} />
                <div>{onSelectPerson && person.personId ? <button type="button" className={styles.personName} onClick={() => selectPerson(person)} aria-label={`Filter report for ${person.name}`}>{person.name}</button> : <span className={styles.personName}>{person.name}</span>}<p className="mt-1 text-[10px] font-normal text-sts-muted">{person.score === null ? "Not ranked" : `${person.slaResolutionSamples} SLA completion samples`}</p></div>
              </div></th>
              <td><span className={styles.number}>{person.assigned}</span></td>
              <td><span className={styles.number}>{person.completed}</span><p className={styles.hint} title={priorityLabels.map((p) => `${p}: ${person.priorities[p] ?? 0}`).join(" · ")}>{priorityLabels.filter((p) => person.priorities[p]).map((p) => `${p[0]} ${person.priorities[p]}`).join(" · ") || "No completions"}</p></td>
              <td><SlaCell counts={person.responseSla} /></td><td><SlaCell counts={person.resolutionSla} /></td>
              <td title={formatPerformanceDuration(person.avgReplySecs)}><span className={styles.number}>{shortTime(person.avgReplySecs)}</span><p className={styles.hint}>{person.replySamples} replies</p></td>
              <td title={formatPerformanceDuration(person.avgCompletionSecs)}><span className={styles.number}>{shortTime(person.avgCompletionSecs)}</span><p className={styles.hint} title={formatPerformanceDuration(person.avgSlaResolutionSecs)}>SLA clock: {shortTime(person.avgSlaResolutionSecs)}</p></td>
              <td><span className={person.rank === 1 ? styles.badge : styles.number}>{person.score ?? "—"}</span></td>
            </tr>)}
            {!people.length && <tr><td colSpan={8}><div className={styles.empty}>{search ? `No people match “${search}”.` : "No user performance data for this period."}</div></td></tr>}
            </tbody>
          </table>
        </div>
        <div className={styles.footer}><span>{people.length} people shown · Priority key: U urgent, C critical, H high, M medium, L low</span><span>Scores are out of 100</span></div>
        <details className={styles.method}><summary>How this report is calculated</summary><p>Assigned counts use tickets created in the period. Completions and priorities use completion dates. Response outcomes use the policy response boundary, which can precede a customer reply. Pending and breached open tickets created in the period are also included.</p><p>Actual reply time runs from creation to the first staff email or public portal reply. Completion time runs from creation to completion. The SLA clock respects working hours and pauses. Current co-assignees share credit; historical ownership is not reconstructed.</p><p>{PERFORMANCE_METHOD} Missing measurements are shown as a dash. Lower sample counts need more context.</p></details>
      </section>

      <details className={`${styles.surface} ${styles.ticketDisclosure}`}>
        <summary className={styles.sectionHeader}><div><h2 className={styles.title}>Ticket timing details</h2><p className={styles.subtitle}>Exact timestamps and durations for {tickets.length} tickets.</p></div><ChevronDown size={18} className={`${styles.disclosureIcon} text-sts-muted`} /></summary>
        <div className="border-t border-sts-card-border px-6 py-4"><label className={`${styles.search} max-w-sm`}><Search size={15} aria-hidden="true" /><input value={ticketSearch} onChange={(event) => { setTicketSearch(event.target.value); setPage(0) }} placeholder="Find a ticket or person…" aria-label="Search ticket timing details" /></label></div>
        <div className={styles.tableScroll}><table className={styles.table}><caption className="sr-only">Exact customer reply and ticket completion measurements</caption>
          <thead><tr>{["Ticket", "Priority", "Completed / first reply", "Response SLA", "Resolution SLA", "Reply time", "Completion time", "SLA clock"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{visibleTickets.map((ticket) => <tr key={ticket.id}>
            <th scope="row" className="min-w-60"><Link href={`/tickets/${ticket.id}`} className="font-semibold hover:text-sts-blue">{ticket.ticket}</Link><p className="mt-1 max-w-64 truncate font-normal text-sts-muted" title={ticket.title}>{ticket.title}</p><p className={styles.hint}>{ticket.people}</p></th>
            <td>{ticket.priority}</td><td className="whitespace-nowrap"><p>{ticket.completedAt ? <time dateTime={ticket.completedAt}>{new Date(ticket.completedAt).toLocaleString()}</time> : "Not completed in period"}</p><p className={styles.hint}>{ticket.repliedAt ? <time dateTime={ticket.repliedAt}>{new Date(ticket.repliedAt).toLocaleString()}</time> : "No reply in period"}</p></td>
            {[ticket.responseSla, ticket.resolutionSla].map((outcome, index) => <td key={index} className={outcome === "Breached" ? styles.bad : outcome === "Met" ? styles.good : "text-sts-muted"}>{outcome}</td>)}
            {[ticket.replySecs, ticket.completionSecs, ticket.slaResolutionSecs].map((seconds, index) => <td key={index}><span className={styles.number}>{formatPerformanceDuration(seconds)}</span></td>)}
          </tr>)}{!visibleTickets.length && <tr><td colSpan={8}><div className={styles.empty}>No tickets match this view.</div></td></tr>}</tbody>
        </table></div>
        <div className={styles.footer}><span>{filteredTickets.length ? `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, filteredTickets.length)}` : "0"} of {filteredTickets.length} tickets · Export includes every ticket</span><div className="flex items-center gap-4"><button type="button" className={styles.textButton} disabled={!currentPage} onClick={() => setPage(currentPage - 1)} aria-label="Previous ticket page"><ChevronLeft size={15} />Previous</button><button type="button" className={styles.textButton} disabled={currentPage >= maxPage} onClick={() => setPage(currentPage + 1)} aria-label="Next ticket page">Next<ChevronRight size={15} /></button></div></div>
      </details>
    </div>
  )
}
