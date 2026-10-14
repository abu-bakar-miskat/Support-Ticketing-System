import "server-only"
import { prisma } from "@/lib/db"
import { createReportExportJob, runReportExportJobAsSystem } from "./report-export-job"
import type { ReportType } from "./export-doc"
import { readScheduleSettings } from "./schedule-settings"
import type { ScheduleFrequency } from "./schedule-settings"
import { nextScheduledRun } from "./schedule-calendar"
import { prepareScheduleReport } from "./schedule-service"

const DAY_MS = 86400000
/** Legacy interval schedules keep their original behavior. */
export function computeNextRun(frequency: ScheduleFrequency, from: Date): Date {
  if (frequency === "MONTHLY") {
    const next = new Date(from)
    const day = next.getUTCDate()
    next.setUTCDate(1); next.setUTCMonth(next.getUTCMonth() + 1)
    const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()
    next.setUTCDate(Math.min(day, last))
    return next
  }
  return new Date(from.getTime() + (frequency === "WEEKLY" ? 7 : 1) * DAY_MS)
}

export async function runDueReportSchedules(now: Date = new Date()): Promise<number> {
  const due = await prisma.reportSchedule.findMany({ where: { enabled: true, nextRunAt: { lte: now } } })
  let ran = 0
  for (const schedule of due) {
    let settings: ReturnType<typeof readScheduleSettings> = null
    let configurationError: unknown
    try { settings = readScheduleSettings(schedule.settings) } catch (error) { configurationError = error }
    const nextRunAt = settings ? nextScheduledRun(schedule.frequency, settings, now) : computeNextRun(schedule.frequency, now)
    // Compare the due marker and version: parallel cron passes and concurrent
    // edits cannot create duplicate runs or restore stale configuration.
    const claim = await prisma.reportSchedule.updateMany({
      where: { id: schedule.id, tenantId: schedule.tenantId, enabled: true, nextRunAt: schedule.nextRunAt, updatedAt: schedule.updatedAt },
      data: { lastRunAt: now, nextRunAt },
    })
    if (!claim.count) continue
    ran++
    try {
      if (configurationError) throw configurationError
      const prepared = await prepareScheduleReport(schedule.tenantId, settings, schedule.rangeDays, now)
      const job = await createReportExportJob({
        ...prepared, tenantId: schedule.tenantId, createdById: schedule.createdById,
        reportType: schedule.reportType as ReportType, format: schedule.format,
        context: { scheduleId: schedule.id, name: schedule.name, kind: "scheduled" },
      })
      await runReportExportJobAsSystem(job.id)
    } catch (error) {
      // Scope/configuration failures belong in run history too. A deleted
      // selection fails closed instead of exporting the entire tenant.
      try {
        const job = await createReportExportJob({
          tenantId: schedule.tenantId, createdById: schedule.createdById, reportType: schedule.reportType as ReportType, format: schedule.format,
          reportParams: { start: new Date(now.getTime() - schedule.rangeDays * DAY_MS).toISOString(), end: now.toISOString() },
          scope: { kind: "none" }, context: { scheduleId: schedule.id, name: schedule.name, kind: "scheduled" },
        })
        await prisma.reportExportJob.update({ where: { id: job.id }, data: { status: "FAILED", completedAt: now, failureReason: error instanceof Error ? error.message : "Invalid schedule configuration" } })
      } catch (historyError) {
        console.error(`[scheduled-reports] could not record failure for ${schedule.id}`, historyError)
      }
    }
  }
  return ran
}
