import { NextResponse } from "next/server"
import { runAsSystem } from "@/lib/request-scope"
import { parseScheduleInput, prepareScheduleReport, requireScheduleAdmin, scheduleError } from "@/lib/reporting/schedule-service"
import { buildReportExportDoc } from "@/lib/reporting/export-doc"
import { nextScheduledRun } from "@/lib/reporting/schedule-calendar"

export async function POST(request: Request) {
  const auth = await requireScheduleAdmin()
  if (auth.error) return auth.error
  return runAsSystem(async () => {
    try {
      const input = parseScheduleInput(await request.json(), true)
      const prepared = await prepareScheduleReport(auth.tenantId, input.settings, input.rangeDays)
      const result = await buildReportExportDoc(input.reportType, prepared.reportParams, prepared.scope)
      return NextResponse.json({ ...result, range: prepared.reportParams, nextRunAt: nextScheduledRun(input.frequency, input.settings, new Date()).toISOString() })
    } catch (error) { return scheduleError(error) }
  })
}
