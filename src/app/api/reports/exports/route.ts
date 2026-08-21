import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { resolveReportScope } from "@/lib/reporting/report-scope"

// RPT-06: recent generated report exports (scheduled + on-demand async) for the
// active tenant, for the Project Admin to download. Cross-department scope only.
export async function GET() {
  const { profile, error } = await requireAuth()
  if (error) return error

  const scope = await resolveReportScope(profile!)
  if (scope.kind !== "cross_department") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const jobs = await prisma.reportExportJob.findMany({
    where: { tenantId: scope.tenantId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      reportType: true,
      format: true,
      status: true,
      resultUrl: true,
      rowCount: true,
      createdAt: true,
      completedAt: true,
    },
  })
  return NextResponse.json({ exports: jobs })
}
