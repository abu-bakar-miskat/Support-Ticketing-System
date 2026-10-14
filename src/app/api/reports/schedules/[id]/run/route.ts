import { NextResponse, after } from "next/server"
import { prisma } from "@/lib/db"
import { runAsSystem } from "@/lib/request-scope"
import { prepareScheduleReport, requireScheduleAdmin, scheduleError } from "@/lib/reporting/schedule-service"
import { readScheduleSettings } from "@/lib/reporting/schedule-settings"
import { createReportExportJob, runReportExportJobAsSystem } from "@/lib/reporting/report-export-job"
import type { ReportType } from "@/lib/reporting/export-doc"

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireScheduleAdmin()
  if (auth.error) return auth.error
  const { id } = await params
  return runAsSystem(async () => {
    const schedule = await prisma.reportSchedule.findFirst({ where: { id, tenantId: auth.tenantId } })
    if (!schedule) return NextResponse.json({ error: "Schedule not found" }, { status: 404 })
    try {
      const prepared = await prepareScheduleReport(auth.tenantId, readScheduleSettings(schedule.settings), schedule.rangeDays)
      const job = await createReportExportJob({ ...prepared, tenantId: auth.tenantId, createdById: auth.profile.id, reportType: schedule.reportType as ReportType, format: schedule.format, context: { scheduleId: id, name: schedule.name, kind: "manual" } })
      after(() => runReportExportJobAsSystem(job.id))
      return NextResponse.json({ jobId: job.id }, { status: 202 })
    } catch (error) { return scheduleError(error) }
  })
}
