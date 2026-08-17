import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { canManageDeptCalendar, departmentIdInScope } from "@/lib/dept-scope"
import type { Prisma } from "@/generated/prisma/client"

type SlaConfig = { pauseOutsideHours: boolean; atRiskPct: number }
type BusinessHours = { timezone: string; workingDays: number[]; workStartTime: string; workEndTime: string }

const DEFAULT_SLA_CONFIG: SlaConfig = { pauseOutsideHours: false, atRiskPct: 80 }
const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  timezone: "UTC",
  workingDays: [1, 2, 3, 4, 5],
  workStartTime: "09:00",
  workEndTime: "17:00",
}

function readSlaConfig(value: unknown): SlaConfig {
  const stored = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  return {
    pauseOutsideHours: typeof stored.pauseOutsideHours === "boolean" ? stored.pauseOutsideHours : DEFAULT_SLA_CONFIG.pauseOutsideHours,
    atRiskPct: typeof stored.atRiskPct === "number" ? stored.atRiskPct : DEFAULT_SLA_CONFIG.atRiskPct,
  }
}

function readBusinessHours(value: unknown): BusinessHours {
  const stored = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  return {
    timezone: typeof stored.timezone === "string" ? stored.timezone : DEFAULT_BUSINESS_HOURS.timezone,
    workingDays: Array.isArray(stored.workingDays) ? (stored.workingDays as number[]) : DEFAULT_BUSINESS_HOURS.workingDays,
    workStartTime: typeof stored.workStartTime === "string" ? stored.workStartTime : DEFAULT_BUSINESS_HOURS.workStartTime,
    workEndTime: typeof stored.workEndTime === "string" ? stored.workEndTime : DEFAULT_BUSINESS_HOURS.workEndTime,
  }
}

/** GET /api/departments/:id/sla-settings — SLA-04/WH-05 pause + business-hours config. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  if (!(await departmentIdInScope(profile, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const department = await prisma.department.findUnique({
    where: { id },
    select: { slaConfig: true, businessHours: true },
  })
  if (!department) return NextResponse.json({ error: "Department not found" }, { status: 404 })

  return NextResponse.json({
    slaConfig: readSlaConfig(department.slaConfig),
    businessHours: readBusinessHours(department.businessHours),
  })
}

/** PATCH /api/departments/:id/sla-settings — update pause-outside-hours + business calendar. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  if (!canManageDeptCalendar(profile, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const department = await prisma.department.findUnique({
    where: { id },
    select: { slaConfig: true, businessHours: true },
  })
  if (!department) return NextResponse.json({ error: "Department not found" }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const nextSlaConfig = readSlaConfig({ ...readSlaConfig(department.slaConfig), ...body.slaConfig })
  const nextBusinessHours = readBusinessHours({ ...readBusinessHours(department.businessHours), ...body.businessHours })

  if (nextSlaConfig.atRiskPct <= 0 || nextSlaConfig.atRiskPct > 100) {
    return NextResponse.json({ error: "atRiskPct must be between 1 and 100" }, { status: 400 })
  }

  const updated = await prisma.department.update({
    where: { id },
    data: {
      slaConfig: nextSlaConfig as Prisma.InputJsonValue,
      businessHours: nextBusinessHours as Prisma.InputJsonValue,
    },
    select: { slaConfig: true, businessHours: true },
  })

  return NextResponse.json({
    slaConfig: readSlaConfig(updated.slaConfig),
    businessHours: readBusinessHours(updated.businessHours),
  })
}
