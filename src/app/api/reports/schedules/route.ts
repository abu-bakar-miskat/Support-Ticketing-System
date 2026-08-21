import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { resolveReportScope } from "@/lib/reporting/report-scope"
import { REPORT_TYPES, type ReportType } from "@/lib/reporting/export-doc"
import type { ReportExportFormat, ReportScheduleFrequency } from "@/generated/prisma/enums"

const FORMATS = ["CSV", "XLSX", "PDF"] as const
const FREQUENCIES = ["DAILY", "WEEKLY"] as const

// RPT-06: manage periodic report schedules. Scheduled (cross-department)
// reports are a Project Admin capability, so both list + create require
// cross-department scope.
export async function GET() {
  const { profile, error } = await requireAuth()
  if (error) return error

  const scope = await resolveReportScope(profile!)
  if (scope.kind !== "cross_department") {
    return NextResponse.json({ error: "Scheduled reports require Project Admin access" }, { status: 403 })
  }

  const schedules = await prisma.reportSchedule.findMany({
    where: { tenantId: scope.tenantId },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json({ schedules })
}

export async function POST(req: NextRequest) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const scope = await resolveReportScope(profile!)
  if (scope.kind !== "cross_department") {
    return NextResponse.json({ error: "Scheduled reports require Project Admin access" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const reportType = body?.reportType as ReportType
  const format = body?.format as ReportExportFormat
  const frequency = body?.frequency as ReportScheduleFrequency
  const rangeDays = Number.isFinite(body?.rangeDays) ? Math.max(1, Math.min(365, Math.floor(body.rangeDays))) : 30

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 })
  if (!(REPORT_TYPES as readonly string[]).includes(reportType)) {
    return NextResponse.json({ error: `reportType must be one of ${REPORT_TYPES.join(", ")}` }, { status: 400 })
  }
  if (!(FORMATS as readonly string[]).includes(format)) {
    return NextResponse.json({ error: "format must be one of CSV, XLSX, PDF" }, { status: 400 })
  }
  if (!(FREQUENCIES as readonly string[]).includes(frequency)) {
    return NextResponse.json({ error: "frequency must be DAILY or WEEKLY" }, { status: 400 })
  }

  const now = new Date()
  const schedule = await prisma.reportSchedule.create({
    data: {
      tenantId: scope.tenantId,
      createdById: profile!.id,
      name,
      reportType,
      format,
      frequency,
      rangeDays,
      // Due on the next cron pass so the first report lands promptly.
      nextRunAt: now,
    },
  })
  return NextResponse.json({ schedule }, { status: 201 })
}
