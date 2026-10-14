import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireScheduleAdmin } from "@/lib/reporting/schedule-service"
import type { JobParams } from "@/lib/reporting/report-export-job"

export async function GET() {
  const auth = await requireScheduleAdmin()
  if (auth.error) return auth.error
  const jobs = await prisma.reportExportJob.findMany({
    where: { tenantId: auth.tenantId }, orderBy: { createdAt: "desc" }, take: 50,
    select: { id: true, reportType: true, format: true, status: true, resultUrl: true, rowCount: true,
      createdAt: true, startedAt: true, completedAt: true, failureReason: true, params: true },
  })
  return NextResponse.json({ exports: jobs.map(({ params, ...job }) => {
    const snapshot = params as unknown as JobParams
    return { ...job, context: snapshot.context, range: snapshot.reportParams }
  }) })
}
