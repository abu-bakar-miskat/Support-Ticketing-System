import type { ReportsOverview } from "@/lib/api/reports"

export function TicketPerformancePanel({ overview, onSelectPerson }: {
  overview: ReportsOverview
  onSelectPerson?: (id: string) => void
}) {
  const counts = [
    ["TOTAL TICKETS", overview.totals.total],
    ["CUSTOM / MANUAL", overview.ticketSources.manual],
    ["SUPPORT TICKETS", overview.ticketSources.support],
    ["PORTAL TICKETS", overview.ticketSources.portal],
    ["SHARED MAILBOX", overview.ticketSources.mailbox],
  ] as const
  return (
    <section aria-label="Ticket overview" className="flex flex-col gap-3.5">
      <p className="font-sans text-[12px] text-sts-muted">
        Tickets created in the selected period, across the current department and person filters.
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {counts.map(([label, count]) => (
          <div key={label} className="rounded-xl border border-sts-card-border bg-sts-card px-4 py-3.5">
            <p className="sts-text-stat-label">{label}</p>
            <p className="mt-1.5 font-mono text-[22px] font-semibold leading-none tabular-nums text-sts-foreground">{count}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-sts-card-border bg-sts-card">
        <div className="border-b border-sts-card-border px-4 py-3">
          <h2 className="font-sans text-[13px] font-semibold text-sts-foreground">Ticket performance by person</h2>
          <p className="mt-1 font-sans text-[12px] text-sts-muted">
            Assigned and completed counts use current assignees. SLA met means completed without a first-response or resolution breach; SLA missed includes open tickets already breached.
            Pending tickets have not breached yet. No SLA means no applicable policy. Tickets with multiple assignees count once for each person.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left font-sans text-[12px]">
            <caption className="sr-only">Assigned tickets, completions, and SLA outcomes for each person in the selected report</caption>
            <thead className="border-b border-sts-card-border text-sts-muted">
              <tr>
                {["Person", "Assigned", "Completed", "SLA met", "SLA missed", "SLA pending", "No SLA"].map((label, index) => (
                  <th key={label} scope="col" className={`whitespace-nowrap px-4 py-2.5 font-medium ${index ? "text-right" : ""}`}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {overview.personPerformance.map((person) => (
                <tr key={person.personId ?? "unassigned"} className="border-b border-sts-card-border last:border-0">
                  <th scope="row" className="px-4 py-3 font-medium text-sts-foreground">
                    {onSelectPerson && person.personId ? (
                      <button type="button" onClick={() => onSelectPerson(person.personId!)} className="text-left text-sts-blue hover:underline" aria-label={`Filter report for ${person.name}`}>{person.name}</button>
                    ) : person.name}
                  </th>
                  {[person.assigned, person.completed, person.slaMet, person.slaMissed, person.slaPending, person.noSla].map((count, index) => (
                    <td key={index} className={`px-4 py-3 text-right font-mono tabular-nums ${index === 3 && count ? "text-red-600 dark:text-red-400" : "text-sts-foreground"}`}>{count}</td>
                  ))}
                </tr>
              ))}
              {!overview.personPerformance.length && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sts-muted">No people or assigned tickets in this report.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
