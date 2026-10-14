import { NextResponse, after } from "next/server"
import { prisma } from "@/lib/db"
import { runAsSystem } from "@/lib/request-scope"
import { requireScheduleAdmin, checkScheduledExportsEnabled, scheduleError } from "@/lib/reporting/schedule-service"
import { createReportExportJob, runReportExportJobAsSystem, type JobParams } from "@/lib/reporting/report-export-job"
import type { ReportType } from "@/lib/reporting/export-doc"

export async function POST(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const auth = await requireScheduleAdmin()
  if (auth.error) return auth.error
  const { jobId } = await params
  return runAsSystem(async () => {
    const original = await prisma.reportExportJob.findFirst({ where: { id: jobId, tenantId: auth.tenantId } })
    if (!original) return NextResponse.json({ error: "Report not found" }, { status: 404 })
    if (original.status !== "FAILED") return NextResponse.json({ error: "Only failed reports can be retried" }, { status: 400 })
    try {
      await checkScheduledExportsEnabled(auth.tenantId)
      const snapshot = original.params as unknown as JobParams
      if (snapshot.scope.kind === "none" || snapshot.scope.tenantId !== auth.tenantId) throw new Error("Fix this schedule's scope before running it again")
      const job = await createReportExportJob({
        tenantId: auth.tenantId, createdById: auth.profile.id, reportType: original.reportType as ReportType, format: original.format,
        reportParams: snapshot.reportParams, scope: snapshot.scope,
        context: { ...snapshot.context, name: snapshot.context?.name ?? "Report retry", kind: "retry" },
      })
      after(() => runReportExportJobAsSystem(job.id))
      return NextResponse.json({ jobId: job.id }, { status: 202 })
    } catch (error) { return scheduleError(error) }
  })
}
