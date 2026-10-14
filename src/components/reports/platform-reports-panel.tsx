"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, ArrowUpRight, Building2, ChartColumn, Check, ChevronDown, RefreshCw, Search } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ReportDateRangePicker, formatRangeLabel, presetRange, type PresetId } from "./report-date-range-picker"
import { PlatformReportsSkeleton } from "./platform-reports-skeleton"
import { buildPlatformReportsExportDoc, buildTenantCardsExportDoc } from "@/lib/exports/platform-reports-export-doc"
import { formatPerformanceDuration } from "@/lib/reporting/user-performance"
import { ReportsExportMenu } from "@/components/time/reports-export-menu"
import type { OrganizationReportRow, PlatformReportsResponse, PlatformReportsResult, PlatformTenantCard } from "@/lib/api/platform-reports"
import styles from "./report-layout.module.css"

function ReportFilter({ label, value, options, onChange, disabled = false }: {
  label: string; value: string; options: { id: string; name: string }[]; onChange: (id: string) => void; disabled?: boolean
}) {
  const selected = value === "all" ? label : options.find((option) => option.id === value)?.name ?? "Selected"
  return <DropdownMenu>
    <DropdownMenuTrigger disabled={disabled} aria-label={`${label}: ${selected}`} className="flex h-9 w-[180px] items-center justify-between gap-2 rounded-lg border border-sts-card-border bg-[var(--sts-card-solid)] px-3 text-[11.5px] font-semibold outline-none transition-colors hover:bg-sts-bg focus-visible:ring-2 focus-visible:ring-sts-blue disabled:opacity-50">
      <span className="truncate">{selected}</span><ChevronDown className="size-3 shrink-0 text-sts-muted" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="max-h-72 min-w-48 overflow-y-auto">
      {[{ id: "all", name: label }, ...options].map((option) => <DropdownMenuItem key={option.id} onClick={() => onChange(option.id)} className="gap-2 text-xs">
        <span className="flex-1 truncate">{option.name}</span>{value === option.id && <Check className="size-3 text-sts-blue" />}
      </DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>
}

function slaRate(met: number, breached: number) {
  return met + breached ? `${Math.round(met / (met + breached) * 100)}%` : "—"
}

function OrganizationTable({ title, description, rows, level, onSelect }: {
  title: string; description: string; rows: OrganizationReportRow[]; level: "tenant" | "department" | "subdepartment"; onSelect: (row: OrganizationReportRow) => void
}) {
  const [search, setSearch] = useState("")
  const filtered = rows.filter((row) => `${row.name} ${row.tenantName} ${row.departmentName ?? ""}`.toLowerCase().includes(search.toLowerCase()))
  return <section className={styles.surface} aria-label={title}>
    <div className={styles.sectionHeader}><div><h2 className={styles.title}>{title}</h2><p className={styles.subtitle}>{description}</p></div><label className={styles.search}><Search size={14} /><input aria-label={`Search ${title.toLowerCase()}`} placeholder={`Search ${title.toLowerCase()}`} value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
    <div className={styles.tableScroll}><table className={`${styles.table} min-w-[880px]`}>
      <caption className="sr-only">{title}: ticket activity, resolution SLA, and completion times</caption>
      <thead><tr>{["Organization", "Created", "Completed", "Open from period", "Resolution SLA", "Avg. completion"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{filtered.map((row) => <tr key={row.id}>
        <th scope="row" className="min-w-52"><button type="button" className={styles.personName} onClick={() => onSelect(row)}>{row.name}</button>{level !== "tenant" && <p className={styles.hint}>{row.tenantName}{row.departmentName ? ` · ${row.departmentName}` : ""}</p>}</th>
        <td className={styles.number}>{row.created}</td><td className={styles.number}>{row.completed}</td><td className={styles.number}>{row.openCreated}</td>
        <td><div className="flex items-center justify-end gap-3 whitespace-nowrap"><b className={styles.number}>{slaRate(row.slaMet, row.slaBreached)}</b><span className={styles.good}>{row.slaMet} met</span><span className={row.slaBreached ? styles.bad : "text-sts-muted"}>{row.slaBreached} breached</span></div><p className={styles.hint}>{row.slaPending} pending · {row.noPolicy} no policy</p></td>
        <td><span className={styles.number}>{formatPerformanceDuration(row.avgCompletionSecs)}</span><p className={styles.hint}>{row.completionSamples} completions measured</p></td>
      </tr>)}</tbody>
    </table></div>
    {!filtered.length && <p className={styles.empty}>{search ? "No organizations match your search." : "No organizations in this scope."}</p>}
    <div className={styles.footer}><span>{filtered.length} of {rows.length} organizations · Zero-activity organizations included</span><span>Select a row to filter the report</span></div>
  </section>
}

function TenantCardLogo({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  const [failed, setFailed] = useState(false)
  if (!logoUrl || failed) return <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sts-surface text-sts-blue"><Building2 size={20} aria-hidden="true" /></span>
  return <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-sts-card-border bg-white p-1">
    {/* Tenant logos use arbitrary uploaded URLs; keep them uncropped. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={logoUrl} alt={`${name} logo`} width={40} height={40} loading="lazy" className="size-full object-contain" onError={() => setFailed(true)} />
  </span>
}

function TenantCards({ tenants, onSelect }: { tenants: PlatformTenantCard[]; onSelect: (tenant: PlatformTenantCard) => void }) {
  const [search, setSearch] = useState("")
  const filtered = tenants.filter((tenant) => tenant.name.toLowerCase().includes(search.toLowerCase()))
  return <section aria-label="Tenant summaries">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className={styles.title}>Tenants</h2><p className={styles.subtitle}>{tenants.length} tenants · Choose a tenant to view its department and subdepartment reports.</p></div><label className={styles.search}><Search size={14} /><input aria-label="Search tenants" placeholder="Search tenants" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {filtered.map((tenant) => <button key={tenant.id} type="button" onClick={() => onSelect(tenant)} aria-label={`View reports for ${tenant.name}`} className={`${styles.surface} group p-6 text-left transition-colors hover:border-sts-blue/50 hover:bg-sts-blue-tint/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sts-blue`}>
        <div className="flex items-start gap-3"><TenantCardLogo key={tenant.logoUrl} name={tenant.name} logoUrl={tenant.logoUrl} /><div className="min-w-0 flex-1"><h3 className="break-words text-base font-semibold tracking-tight">{tenant.name}</h3><p className="mt-1 text-xs capitalize text-sts-muted">{tenant.type} · {tenant.status}</p></div><ArrowUpRight size={16} className="shrink-0 text-sts-muted transition-colors group-hover:text-sts-blue" /></div>
        <p className="mt-6 text-3xl font-semibold tabular-nums tracking-tight">{tenant.ticketCount}</p><p className="mt-1 text-xs text-sts-muted">Tickets created in the selected period</p>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-sts-card-border pt-4 text-xs text-sts-muted"><span><b className="mr-1 font-semibold tabular-nums text-sts-foreground">{tenant.departmentCount}</b>departments</span><span><b className="mr-1 font-semibold tabular-nums text-sts-foreground">{tenant.subDepartmentCount}</b>subdepartments</span></div>
        <p className="mt-5 text-xs font-medium text-sts-blue">View reports →</p>
      </button>)}
    </div>
    {!filtered.length && <div className={`${styles.surface} ${styles.empty}`}>{search ? "No tenants match your search." : "No tenants on the platform yet."}</div>}
  </section>
}

function isTenantReport(report: PlatformReportsResult | undefined): report is PlatformReportsResponse & { mode: "tenant" } {
  return report?.mode === "tenant"
}

export function PlatformReportsPanel() {
  const [presetId, setPresetId] = useState<PresetId | "custom">("30d")
  const [range, setRange] = useState(() => presetRange("30d"))
  const [openedTenant, setOpenedTenant] = useState<{ id: string; name: string } | null>(null)
  const tenantId = openedTenant?.id ?? "all"
  const [departmentId, setDepartmentId] = useState("all")
  const [subDepartmentId, setSubDepartmentId] = useState("all")
  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: ["reports", "platform", "on-demand", range.from, range.to, tenantId, departmentId, subDepartmentId],
    queryFn: async ({ signal }): Promise<PlatformReportsResult> => {
      const params = new URLSearchParams({ ...range, tenantId, departmentId, subDepartmentId })
      const response = await fetch(`/api/reports/platform?${params}`, { signal })
      if (!response.ok) throw new Error("Failed to load platform reports")
      return response.json()
    }, staleTime: 60_000, gcTime: 5 * 60_000, refetchOnWindowFocus: false, retry: 1,
  })
  const detail = isTenantReport(data) ? data : undefined
  const [options, setOptions] = useState<PlatformReportsResponse>()
  if (detail && detail !== options) setOptions(detail)
  const departments = (detail ?? options)?.departments.filter((department) => department.tenantId === tenantId) ?? []
  const subDepartments = (detail ?? options)?.subDepartments.filter((sub) => sub.tenantId === tenantId && sub.departmentId === departmentId) ?? []
  const scopeLabel = [openedTenant?.name ?? "All tenants", departmentId === "all" ? null : departments.find((department) => department.id === departmentId)?.name ?? "Department", subDepartmentId === "all" ? null : subDepartments.find((sub) => sub.id === subDepartmentId)?.name ?? "Subdepartment"].filter(Boolean).join(" · ")
  const rangeLabel = formatRangeLabel(range.from, range.to)
  const selectTenant = (tenant: { id: string; name: string } | null) => { setOpenedTenant(tenant); setDepartmentId("all"); setSubDepartmentId("all") }
  const selectDepartment = (id: string) => { setDepartmentId(id); setSubDepartmentId("all") }
  const tableKey = `${tenantId}:${departmentId}:${subDepartmentId}`
  const exportDoc = !data || isError || isFetching ? undefined : data.mode === "tenants" ? buildTenantCardsExportDoc(data, rangeLabel) : buildPlatformReportsExportDoc(data, rangeLabel, scopeLabel)
  return <div className="sts-page-pad h-full overflow-y-auto bg-sts-bg/80"><div className={styles.page}>
    <PageHeader title={openedTenant ? `${openedTenant.name} reports` : "Reports"} className="[&_h1]:text-2xl [&_h1]:tracking-tight" icon={ChartColumn} iconClassName="text-sts-blue" description={openedTenant ? "Ticket activity, completions, and SLA reliability across this tenant’s departments and subdepartments." : "Choose a tenant to explore its department and subdepartment reports."} badge={<span className="rounded-md bg-sts-surface px-2 py-1 text-[10px] font-medium text-sts-muted">Platform reports</span>} />
    {openedTenant && <nav aria-label="Report navigation"><button type="button" onClick={() => selectTenant(null)} className={`${styles.textButton} text-sts-muted`}><ArrowLeft size={14} />All tenants</button><span className="mx-3 text-xs text-sts-muted">/</span><span className="text-xs font-medium">{openedTenant.name}</span></nav>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1 rounded-lg border border-sts-card-border bg-[var(--sts-card-solid)] p-1" role="group" aria-label="Report period">
        {(["today", "7d", "30d", "1y"] as const).map((id) => <button key={id} type="button" aria-pressed={presetId === id} onClick={() => { setPresetId(id); setRange(presetRange(id)) }} className={`rounded-md px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sts-blue ${presetId === id ? "bg-sts-surface text-sts-foreground" : "text-sts-muted hover:bg-sts-surface/60"}`}>
          {{ today: "Day", "7d": "Week", "30d": "Month", "1y": "Year" }[id]}
        </button>)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {openedTenant && <ReportFilter label="All departments" value={departmentId} options={departments} disabled={isPending} onChange={selectDepartment} />}
        {departmentId !== "all" && <ReportFilter label="All subdepartments" value={subDepartmentId} options={subDepartments} disabled={isPending} onChange={setSubDepartmentId} />}
        <ReportDateRangePicker presetId={presetId} range={range} onChange={(id, next) => { setPresetId(id); setRange(next) }} />
        <ReportsExportMenu document={exportDoc} rangeLabel={rangeLabel} scopeLabel={scopeLabel} />
        <button type="button" aria-label="Refresh reports" disabled={isFetching} onClick={() => refetch()} className="flex size-9 items-center justify-center rounded-lg border border-sts-card-border bg-[var(--sts-card-solid)] text-sts-muted transition-colors hover:text-sts-blue focus-visible:outline-2 focus-visible:outline-sts-blue disabled:opacity-50"><RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} /></button>
      </div>
    </div>
    <p className="-mt-2 text-xs text-sts-muted">{rangeLabel} · {scopeLabel}</p>
    <div aria-busy={isFetching} className="flex flex-col gap-5">
      {isError ? <div role="alert" className={`${styles.surface} ${styles.empty}`}><p>Failed to load {openedTenant ? "tenant reports" : "tenant summaries"}.</p><button type="button" onClick={() => refetch()} className={`${styles.textButton} mt-3`}>Retry</button></div>
        : isPending ? <PlatformReportsSkeleton view={openedTenant ? "detail" : "tenants"} />
          : data.mode === "tenants" ? <TenantCards tenants={data.tenants} onSelect={selectTenant} />
            : <>
          <section className={styles.surface} aria-label="Tenant overview"><div className={styles.metrics}>
            {[
              { label: "Tickets created", value: data.summary.created, hint: "Created in the selected period" },
              { label: "Tickets completed", value: data.summary.completed, hint: "Completed in the selected period" },
              { label: "Open from period", value: data.summary.openCreated, hint: "Created in period, currently incomplete" },
              { label: "Resolution SLA met", value: slaRate(data.summary.slaMet, data.summary.slaBreached), hint: `${data.summary.slaMet} met · ${data.summary.slaBreached} breached` },
            ].map((metric) => <div className={styles.metric} key={metric.label}><p className={styles.label}>{metric.label}</p><p className={styles.metricValue}>{metric.value}</p><p className={styles.hint}>{metric.hint}</p></div>)}
          </div></section>
          <OrganizationTable key={`department:${tableKey}`} title="Departments" description="Department totals within this tenant. Select a department to focus the report." rows={data.departmentReports} level="department" onSelect={(row) => selectDepartment(row.id)} />
          <OrganizationTable key={`subdepartment:${tableKey}`} title="Subdepartments" description="Subdepartment totals, grouped under their parent departments." rows={data.subDepartmentReports} level="subdepartment" onSelect={(row) => { setDepartmentId(row.departmentId!); setSubDepartmentId(row.id) }} />
          <details className={`${styles.surface} p-6 text-xs text-sts-muted`}><summary className="cursor-pointer font-medium">How this report is calculated</summary><p className="mt-3 leading-relaxed">Tickets count once per organizational level. Created counts use creation dates; completed counts use completion dates and saved completion statuses. Open counts refer to tickets created in the period. Completion time is elapsed time from creation to completion. Resolution SLA results cover tickets created or completed in the period; pending and no-policy tickets are excluded from the met rate. Tickets are grouped under their owning subdepartment and its parent department. Drafts and deleted tickets are excluded.</p></details>
        </>}
    </div>
  </div></div>
}
