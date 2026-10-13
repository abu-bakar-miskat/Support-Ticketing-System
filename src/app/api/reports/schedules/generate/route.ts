import { NextResponse, after } from "next/server"
import { runAsSystem } from "@/lib/request-scope"
import { parseScheduleInput, prepareScheduleReport, requireScheduleAdmin, scheduleError } from "@/lib/reporting/schedule-service"
import { createReportExportJob, runReportExportJobAsSystem } from "@/lib/reporting/report-export-job"

export async function POST(request: Request) {
  const auth = await requireScheduleAdmin()
  if (auth.error) return auth.error
  return runAsSystem(async () => {
    try {
      const input = parseScheduleInput(await request.json(), true)
      const prepared = await prepareScheduleReport(auth.tenantId, input.settings, input.rangeDays)
      const job = await createReportExportJob({ ...prepared, tenantId: auth.tenantId, createdById: auth.profile.id, reportType: input.reportType, format: input.format, context: { name: input.name, kind: "manual" } })
      after(() => runReportExportJobAsSystem(job.id))
      return NextResponse.json({ jobId: job.id }, { status: 202 })
    } catch (error) { return scheduleError(error) }
  })
}
