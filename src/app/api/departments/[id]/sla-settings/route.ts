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

/** Validate that `subDepartmentId` (if given) belongs to department `id`. */
async function resolveSubDepartmentScope(
  departmentId: string,
  raw: string | null | undefined,
): Promise<{ subDepartmentId: string | null } | { error: NextResponse }> {
  const subDepartmentId = raw && raw.trim() ? raw.trim() : null
  if (subDepartmentId) {
    const sub = await prisma.subDepartment.findFirst({
      where: { id: subDepartmentId, departmentId },
      select: { id: true },
    })
    if (!sub) {
      return { error: NextResponse.json({ error: "Sub-department not found in department" }, { status: 404 }) }
    }
  }
  return { subDepartmentId }
}

/** GET /api/departments/:id/sla-settings — SLA-04/WH-05 pause + business-hours config. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  if (!(await departmentIdInScope(profile, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const scope = await resolveSubDepartmentScope(id, req.nextUrl.searchParams.get("subDepartmentId"))
  if ("error" in scope) return scope.error

  const department = await prisma.department.findUnique({
    where: { id },
    select: { slaConfig: true, businessHours: true },
  })
  if (!department) return NextResponse.json({ error: "Department not found" }, { status: 404 })

  // For a sub-department, show its own values, each field falling back to the
  // department's when the sub-department hasn't overridden it yet.
  let slaRaw: unknown = department.slaConfig
  let bhRaw: unknown = department.businessHours
  if (scope.subDepartmentId) {
    const sub = await prisma.subDepartment.findUnique({
      where: { id: scope.subDepartmentId },
      select: { slaConfig: true, businessHours: true },
    })
    if (sub?.slaConfig != null) slaRaw = sub.slaConfig
    if (sub?.businessHours != null) bhRaw = sub.businessHours
  }

  return NextResponse.json({
    slaConfig: readSlaConfig(slaRaw),
    businessHours: readBusinessHours(bhRaw),
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

  const body = await request.json().catch(() => ({}))
  const scope = await resolveSubDepartmentScope(id, body.subDepartmentId as string | undefined)
  if ("error" in scope) return scope.error

  const department = await prisma.department.findUnique({
    where: { id },
    select: { slaConfig: true, businessHours: true },
  })
  if (!department) return NextResponse.json({ error: "Department not found" }, { status: 404 })

  // Merge onto the current values for the target scope (sub-department when
  // provided, else department); fall back to the department's values as the
  // seed for a not-yet-overridden sub-department.
  let baseSla: unknown = department.slaConfig
  let baseBh: unknown = department.businessHours
  if (scope.subDepartmentId) {
    const sub = await prisma.subDepartment.findUnique({
      where: { id: scope.subDepartmentId },
      select: { slaConfig: true, businessHours: true },
    })
    if (sub?.slaConfig != null) baseSla = sub.slaConfig
    if (sub?.businessHours != null) baseBh = sub.businessHours
  }

  const nextSlaConfig = readSlaConfig({ ...readSlaConfig(baseSla), ...body.slaConfig })
  const nextBusinessHours = readBusinessHours({ ...readBusinessHours(baseBh), ...body.businessHours })

  if (nextSlaConfig.atRiskPct <= 0 || nextSlaConfig.atRiskPct > 100) {
    return NextResponse.json({ error: "atRiskPct must be between 1 and 100" }, { status: 400 })
  }

  const data = {
    slaConfig: nextSlaConfig as Prisma.InputJsonValue,
    businessHours: nextBusinessHours as Prisma.InputJsonValue,
  }
  const updated = scope.subDepartmentId
    ? await prisma.subDepartment.update({
        where: { id: scope.subDepartmentId },
        data,
        select: { slaConfig: true, businessHours: true },
      })
    : await prisma.department.update({
        where: { id },
        data,
        select: { slaConfig: true, businessHours: true },
      })

  return NextResponse.json({
    slaConfig: readSlaConfig(updated.slaConfig),
    businessHours: readBusinessHours(updated.businessHours),
  })
}
