"use client"

import { useCallback, useEffect, useState } from "react"
import { CalendarClock, Download, Eye, Loader2, Pencil, Play, Plus, RefreshCw, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { exportReports } from "@/lib/api/reports"
import { cellText, type ExportDoc } from "@/lib/exports/report-doc"
import { PERIOD_LABELS, REPORT_LABELS, type ScheduleInput, type ScheduleSettings } from "@/lib/reporting/schedule-settings"
import styles from "./report-layout.module.css"

type Schedule = Omit<ScheduleInput, "settings"> & { id: string; enabled: boolean; lastRunAt: string | null; nextRunAt: string; settings: ScheduleSettings | null }
type Person = { id: string; name: string; departmentIds: string[] }
type ExportJob = {
  id: string; reportType: string; format: string; status: string; resultUrl: string | null; rowCount: number | null;
  createdAt: string; completedAt: string | null; failureReason: string | null;
  context?: { scheduleId?: string; name: string; kind: string };
  range?: { start: string; end: string; scopeLabel?: string; timezone?: string };
}
type Preview = { doc: ExportDoc; rowCount: number; range: { start: string; end: string; scopeLabel: string }; nextRunAt: string }
const inputClass = "h-9 w-full rounded-lg border border-sts-card-border bg-[var(--sts-card-solid)] px-3 text-xs text-sts-foreground outline-none focus-visible:ring-2 focus-visible:ring-sts-blue"
const actionClass = "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-sts-card-border px-3 text-xs font-medium text-sts-foreground transition-colors hover:bg-sts-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sts-blue disabled:opacity-40"
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const defaultForm: ScheduleInput = { name: "", reportType: "user_performance", format: "XLSX", frequency: "WEEKLY", rangeDays: 30, settings: { departmentId: "all", personId: "all", period: "previous_week", timezone: "Europe/London", runTime: "09:00", weekday: 1, monthDay: 1 } }
function fmtDate(iso: string | null, timezone?: string) {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", ...(timezone ? { timeZone: timezone } : {}) }) : "Not run yet"
}
function reportLabel(type: string) { return REPORT_LABELS[type as keyof typeof REPORT_LABELS] ?? type }
async function jsonRequest(url: string, method = "GET", body?: unknown) {
  const response = await fetch(url, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error ?? "Could not process this report")
  return result
}
function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`flex flex-col gap-1.5 ${className}`}><span className="text-xs font-medium text-sts-muted">{label}</span>{children}</div>
}
export function ScheduledReports({ personId = "all", departmentId = "all" }: { personId?: string; departmentId?: string }) {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [exportsList, setExportsList] = useState<ExportJob[]>([])
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loadError, setLoadError] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ScheduleInput>(defaultForm)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const loadRuns = useCallback(async () => {
    const data = await jsonRequest("/api/reports/exports")
    setExportsList(data.exports ?? [])
  }, [])
  const load = useCallback(async () => {
    const response = await fetch("/api/reports/schedules")
    if (response.status === 403 || response.status === 401) { setAuthorized(false); return }
    setAuthorized(true)
    if (!response.ok) throw new Error("Could not load scheduled reports")
    const data = await response.json()
    setSchedules(data.schedules ?? []); setDepartments(data.departments ?? []); setPeople(data.people ?? [])
    await loadRuns()
    setLoadError("")
  }, [loadRuns])
  useEffect(() => { void Promise.resolve().then(load).catch((error) => setLoadError(error.message)) }, [load])
  const pending = exportsList.some((job) => job.status === "PENDING" || job.status === "RUNNING")
  useEffect(() => {
    if (authorized !== true) return
    const timer = setInterval(() => { load().catch(() => setLoadError("Could not refresh run history. Use Refresh to try again.")) }, pending ? 5000 : 30000)
    return () => clearInterval(timer)
  }, [pending, authorized, load])
  const timezoneOptions = [...new Set([form.settings.timezone, "UTC", ...Intl.supportedValuesOf("timeZone")])].map((value) => ({ value, label: value.replaceAll("_", " ") }))
  const personOptions = people.filter((person) => form.settings.departmentId === "all" || person.departmentIds.includes(form.settings.departmentId)).map((person) => ({ value: person.id, label: person.name }))
  function change(patch: Partial<ScheduleInput>) { setForm((old) => ({ ...old, ...patch })); setPreview(null) }
  function changeSettings(patch: Partial<ScheduleSettings>) { setForm((old) => ({ ...old, settings: { ...old.settings, ...patch } })); setPreview(null) }
  function openNew() {
    setEditingId(null); setPreview(null); setForm({ ...defaultForm, settings: { ...defaultForm.settings, personId, departmentId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } }); setFormOpen(true)
  }
  function edit(schedule: Schedule) {
    setEditingId(schedule.id); setPreview(null)
    setForm({ name: schedule.name, reportType: schedule.reportType, format: schedule.format, frequency: schedule.frequency, rangeDays: schedule.rangeDays, settings: schedule.settings ?? { ...defaultForm.settings, period: "rolling", timezone: "UTC" } })
    setFormOpen(true)
  }
  async function perform(key: string, operation: () => Promise<void>) {
    if (busy) return
    setBusy(key)
    try { await operation() } catch (error) { toast.error(error instanceof Error ? error.message : "Could not process report") } finally { setBusy(null) }
  }
  async function save() {
    await jsonRequest(editingId ? `/api/reports/schedules/${editingId}` : "/api/reports/schedules", editingId ? "PATCH" : "POST", form)
    toast.success(editingId ? "Schedule updated" : "Schedule created")
    setFormOpen(false); setEditingId(null); setPreview(null); await load()
  }
  async function generate(url: string, body?: unknown) {
    await jsonRequest(url, "POST", body)
    toast.success("Report queued. The download will appear in run history.")
    await loadRuns()
  }
  if (authorized === false) return null
  if (authorized === null && !loadError) return <div className={styles.surface} role="status" aria-label="Loading scheduled reports"><div className={styles.sectionHeader}><div className={`${styles.shimmer} h-4 w-40`} /><div className={`${styles.shimmer} h-9 w-28`} /></div></div>
  return (
    <section className={styles.surface} aria-label="Scheduled reports">
      <div className={styles.sectionHeader}>
        <div><h2 className={`${styles.title} flex items-center gap-2`}><CalendarClock size={16} className="text-sts-blue" />Scheduled reports</h2><p className={styles.subtitle}>Save a recurring report or generate one on demand.</p></div>
        <div className="flex gap-2"><button type="button" className={actionClass} disabled={!!busy} onClick={() => perform("refresh", load)} aria-label="Refresh schedules and run history"><RefreshCw size={14} className={busy === "refresh" ? "animate-spin" : ""} /></button><button type="button" className={cn(actionClass, "bg-sts-foreground text-[var(--sts-card-solid)] hover:bg-sts-foreground/90")} disabled={!!busy} onClick={openNew}><Plus size={14} />New schedule</button></div>
      </div>
      {loadError && <p role="alert" className="border-t border-sts-card-border px-6 py-3 text-xs text-sts-red">{loadError}</p>}
      {formOpen && <div className="border-y border-sts-card-border bg-sts-bg/50 p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between"><h3 className="text-sm font-semibold">{editingId ? "Edit schedule" : "New scheduled report"}</h3><button type="button" className={styles.textButton} disabled={!!busy} onClick={() => { setFormOpen(false); setPreview(null) }} aria-label="Close schedule form"><X size={16} /></button></div>
        <form onSubmit={(event) => { event.preventDefault(); perform("save", save) }}>
          <fieldset disabled={!!busy}>
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Name" className="sm:col-span-2"><input aria-label="Schedule name" className={inputClass} value={form.name} maxLength={120} required placeholder="Weekly team performance" onChange={(event) => change({ name: event.target.value })} /></Field>
            <Field label="Report"><SearchableSelect aria-label="Report type" className="w-full rounded-lg" value={form.reportType} onChange={(value) => change({ reportType: value as ScheduleInput["reportType"], settings: { ...form.settings, personId: "all", ...(value === "cross_department" ? { departmentId: "all" } : {}) } })} options={Object.entries(REPORT_LABELS).map(([value, label]) => ({ value, label }))} /></Field>
            <Field label="File format"><SearchableSelect aria-label="File format" className="w-full rounded-lg" value={form.format} onChange={(value) => change({ format: value as ScheduleInput["format"] })} options={[{ value: "XLSX", label: "Excel (.xlsx)" }, { value: "PDF", label: "PDF" }, { value: "CSV", label: "CSV" }]} /></Field>
            <Field label="Department"><SearchableSelect aria-label="Report department" className="w-full rounded-lg" disabled={form.reportType === "cross_department"} value={form.settings.departmentId} onChange={(value) => changeSettings({ departmentId: value, personId: "all" })} options={[{ value: "all", label: "All departments" }, ...departments.map((department) => ({ value: department.id, label: department.name }))]} /></Field>
            <Field label="Person"><SearchableSelect aria-label="Report person" className="w-full rounded-lg" disabled={form.reportType !== "user_performance"} value={form.settings.personId} onChange={(value) => changeSettings({ personId: value })} options={[{ value: "all", label: "Everyone" }, ...personOptions]} /></Field>
            <Field label="Reporting period"><SearchableSelect aria-label="Reporting period" className="w-full rounded-lg" value={form.settings.period} onChange={(value) => changeSettings({ period: value as ScheduleSettings["period"] })} options={Object.entries(PERIOD_LABELS).map(([value, label]) => ({ value, label }))} /></Field>
            <Field label={form.settings.period === "rolling" ? "Look back (days)" : "Period boundaries"}>{form.settings.period === "rolling" ? <input aria-label="Rolling window days" className={inputClass} type="number" min={1} max={365} value={form.rangeDays} onChange={(event) => change({ rangeDays: Number(event.target.value) })} /> : <p className="pt-2 text-xs leading-5 text-sts-muted">{form.settings.period === "previous_week" ? "Monday–Sunday, in the selected timezone." : "The complete calendar period, in the selected timezone."}</p>}</Field>
            <Field label="Frequency"><SearchableSelect aria-label="Schedule frequency" className="w-full rounded-lg" value={form.frequency} onChange={(value) => { const periods = { DAILY: "previous_day", WEEKLY: "previous_week", MONTHLY: "previous_month" } as const; const frequency = value as ScheduleInput["frequency"]; change({ frequency, settings: { ...form.settings, ...(form.settings.period === periods[form.frequency] ? { period: periods[frequency] } : {}) } }) }} options={[{ value: "DAILY", label: "Daily" }, { value: "WEEKLY", label: "Weekly" }, { value: "MONTHLY", label: "Monthly" }]} /></Field>
            <Field label={form.frequency === "MONTHLY" ? "Day of month" : "Run day"}>{form.frequency === "MONTHLY" ? <input aria-label="Day of month" type="number" min={1} max={31} className={inputClass} value={form.settings.monthDay} onChange={(event) => changeSettings({ monthDay: Number(event.target.value) })} /> : form.frequency === "WEEKLY" ? <SearchableSelect aria-label="Weekly run day" className="w-full rounded-lg" value={String(form.settings.weekday)} onChange={(value) => changeSettings({ weekday: Number(value) })} options={days.map((label, index) => ({ value: String(index), label }))} /> : <p className="pt-2 text-xs text-sts-muted">Every day</p>}</Field>
            <Field label="Preferred time"><input aria-label="Preferred run time" type="time" className={inputClass} value={form.settings.runTime} onChange={(event) => changeSettings({ runTime: event.target.value })} /></Field>
            <Field label="Timezone"><SearchableSelect aria-label="Schedule timezone" className="w-full rounded-lg" value={form.settings.timezone} onChange={(value) => changeSettings({ timezone: value })} options={timezoneOptions} searchable /></Field>
          </div>
          <p className="mt-5 max-w-3xl text-xs leading-5 text-sts-muted">User performance includes priorities, separate Response and Resolution SLA outcomes, reply and completion times, rankings, and ticket details. Background checks run every five minutes. Monthly dates beyond the end of a month use its last day.</p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <button type="button" className={styles.textButton} disabled={!!busy || form.reportType !== "user_performance"} onClick={() => changeSettings({ personId, departmentId })}>Use current page filters</button>
            <div className="flex flex-wrap gap-2"><button type="button" className={actionClass} disabled={!!busy} onClick={() => perform("preview", async () => setPreview(await jsonRequest("/api/reports/schedules/preview", "POST", form)))}>{busy === "preview" ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}Preview</button><button type="button" className={actionClass} disabled={!!busy} onClick={() => perform("generate", () => generate("/api/reports/schedules/generate", form))}>{busy === "generate" ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}Generate now</button><button type="submit" className={cn(actionClass, "bg-sts-blue text-sts-blue-fg hover:bg-sts-blue/90")} disabled={!!busy}>{busy === "save" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}{editingId ? "Save changes" : "Save schedule"}</button></div>
          </div>
          </fieldset>
        </form>
        {preview && <div className="mt-6 rounded-xl border border-sts-card-border bg-[var(--sts-card-solid)]">
          <div className={styles.sectionHeader}><div><h3 className={styles.title}>Report preview</h3><p className={styles.subtitle}>{preview.range.scopeLabel} · {fmtDate(preview.range.start, form.settings.timezone)} to {fmtDate(preview.range.end, form.settings.timezone)} (end exclusive)</p><p className={styles.hint}>If saved, next run: {fmtDate(preview.nextRunAt, form.settings.timezone)} · {form.settings.timezone}</p></div><button type="button" className={actionClass} disabled={!!busy} onClick={() => perform("download", () => exportReports(preview.doc, form.format === "XLSX" ? "excel" : form.format === "PDF" ? "pdf" : "csv", "report-preview"))}><Download size={14} />Download preview</button></div>
          {preview.doc.sheets.map((sheet, index) => <details key={sheet.name} open={index === 0} className="border-t border-sts-card-border"><summary className="cursor-pointer px-6 py-3 text-xs font-medium">{sheet.name} <span className="ml-2 text-sts-muted">{sheet.rows.length} rows</span></summary><div className={styles.tableScroll}><table className={styles.table}><thead><tr>{sheet.columns.map((column) => <th key={column.key} scope="col">{column.header}</th>)}</tr></thead><tbody>{sheet.rows.slice(0, 12).map((row, rowIndex) => <tr key={rowIndex}>{sheet.columns.map((column) => <td key={column.key} className="whitespace-nowrap">{cellText(row, column.key)}</td>)}</tr>)}</tbody></table></div>{sheet.rows.length > 12 && <p className="px-6 py-3 text-xs text-sts-muted">Showing the first 12 rows. Download the preview for the complete report.</p>}</details>)}
        </div>}
      </div>}
      {schedules.length ? <div className={styles.tableScroll}><table className={styles.table}><caption className="sr-only">Saved schedules and their next run times</caption><thead><tr>{["Schedule / scope", "Frequency / period", "Last attempt", "Next run", "Actions"].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{schedules.map((schedule) => {
        const latest = exportsList.find((job) => job.context?.scheduleId === schedule.id && job.context?.kind === "scheduled")
        const settings = schedule.settings
        const scopeLabel = `${departments.find((department) => department.id === settings?.departmentId)?.name ?? (settings?.departmentId && settings.departmentId !== "all" ? "Unavailable department" : "All departments")} · ${people.find((person) => person.id === settings?.personId)?.name ?? (settings?.personId && settings.personId !== "all" ? "Unavailable person" : "Everyone")}`
        return <tr key={schedule.id}><th scope="row" className="min-w-60"><p className="font-semibold">{schedule.name}</p><p className={styles.hint}>{reportLabel(schedule.reportType)} · {schedule.format}</p><p className={styles.hint}>{scopeLabel}</p></th><td className="whitespace-nowrap"><p>{schedule.frequency === "MONTHLY" ? "Monthly" : schedule.frequency === "WEEKLY" ? "Weekly" : "Daily"}{settings ? ` · ${settings.runTime}` : ""}</p><p className={styles.hint}>{settings ? settings.period === "rolling" ? `Last ${schedule.rangeDays} days` : PERIOD_LABELS[settings.period] : `Last ${schedule.rangeDays} days`}</p><p className={styles.hint}>{settings?.timezone ?? "Legacy interval schedule"}</p></td><td className="whitespace-nowrap"><p>{fmtDate(schedule.lastRunAt, settings?.timezone)}</p>{latest && <p className={`${styles.hint} ${latest.status === "FAILED" ? "text-sts-red" : ""}`}>{latest.status === "COMPLETED" ? "Completed" : latest.status === "FAILED" ? "Failed" : "Generating…"}</p>}</td><td className="whitespace-nowrap"><p>{schedule.enabled ? fmtDate(schedule.nextRunAt, settings?.timezone) : "Paused"}</p>{settings && <p className={styles.hint}>{schedule.frequency === "WEEKLY" ? days[settings.weekday] : schedule.frequency === "MONTHLY" ? `Day ${settings.monthDay}` : "Every day"}</p>}</td><td><div className="flex items-center justify-end gap-3"><button type="button" className={`${styles.textButton} ${schedule.enabled ? "text-sts-green" : "text-sts-muted"}`} disabled={!!busy} onClick={() => perform(`toggle-${schedule.id}`, async () => { await jsonRequest(`/api/reports/schedules/${schedule.id}`, "PATCH", { enabled: !schedule.enabled }); await load() })}>{schedule.enabled ? "Pause" : "Resume"}</button><button type="button" className={styles.textButton} disabled={!!busy} onClick={() => perform(`run-${schedule.id}`, () => generate(`/api/reports/schedules/${schedule.id}/run`))} aria-label={`Generate ${schedule.name} now`}><Play size={14} /></button><button type="button" className={styles.textButton} disabled={!!busy} onClick={() => edit(schedule)} aria-label={`Edit ${schedule.name}`}><Pencil size={14} /></button>{deleteId === schedule.id ? <><button type="button" className={`${styles.textButton} text-sts-red`} disabled={!!busy} onClick={() => perform(`delete-${schedule.id}`, async () => { await jsonRequest(`/api/reports/schedules/${schedule.id}`, "DELETE"); setDeleteId(null); await load() })}>Delete</button><button type="button" className={styles.textButton} onClick={() => setDeleteId(null)} aria-label="Cancel delete"><X size={14} /></button></> : <button type="button" className={styles.textButton} disabled={!!busy} onClick={() => setDeleteId(schedule.id)} aria-label={`Delete ${schedule.name}`}><Trash2 size={14} /></button>}</div></td></tr>
      })}</tbody></table></div> : !formOpen && !loadError && <div className="border-t border-sts-card-border px-6 py-8"><p className="text-sm font-medium">No schedules yet</p><p className="mt-1 text-xs text-sts-muted">Create a daily, weekly, or monthly report for your team or a specific person.</p></div>}
      <div className="border-t border-sts-card-border">
        <div className={styles.sectionHeader}><div><h3 className={styles.title}>Run history</h3><p className={styles.subtitle}>The latest 50 generated reports, including manual runs and retries.</p></div>{pending && <span role="status" className="flex items-center gap-2 text-xs text-sts-muted"><Loader2 size={14} className="animate-spin" />Generating reports…</span>}</div>
        {exportsList.length ? <div className={styles.tableScroll}><table className={styles.table}><caption className="sr-only">Report generation history, failures, and downloads</caption><thead><tr>{["Report", "Period", "Generated", "Status", "File"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{exportsList.map((job) => <tr key={job.id}><th scope="row" className="min-w-56"><p className="font-semibold">{job.context?.name ?? reportLabel(job.reportType)}</p><p className={styles.hint}>{reportLabel(job.reportType)} · {job.context?.kind ?? "On demand"} · {job.format}</p><p className={styles.hint}>{job.range?.scopeLabel}</p></th><td className="whitespace-nowrap text-xs">{job.range ? <><p>{fmtDate(job.range.start, job.range.timezone)}</p><p className={styles.hint}>to {fmtDate(job.range.end, job.range.timezone)} (exclusive)</p></> : "—"}</td><td className="whitespace-nowrap">{fmtDate(job.completedAt ?? job.createdAt)}</td><td className="min-w-36"><span className={job.status === "COMPLETED" ? "text-sts-green" : job.status === "FAILED" ? "text-sts-red" : "text-sts-muted"}>{job.status === "COMPLETED" ? "Completed" : job.status === "FAILED" ? "Failed" : job.status === "RUNNING" ? "Running" : "Queued"}</span>{job.failureReason && <p className="mt-1 max-w-64 text-xs leading-5 text-sts-muted">{job.failureReason}</p>}</td><td>{job.status === "COMPLETED" && job.resultUrl ? <a href={job.resultUrl} target="_blank" rel="noreferrer" className={styles.textButton}><Download size={14} />Download</a> : job.status === "FAILED" ? <button type="button" className={styles.textButton} disabled={!!busy} onClick={() => perform(`retry-${job.id}`, () => generate(`/api/reports/exports/${job.id}/retry`))}><RefreshCw size={14} />Retry</button> : <span className="text-xs text-sts-muted">Preparing file</span>}</td></tr>)}</tbody></table></div> : <p className="px-6 pb-6 text-xs text-sts-muted">Generated files and any failures will appear here.</p>}
      </div>
    </section>
  )
}
