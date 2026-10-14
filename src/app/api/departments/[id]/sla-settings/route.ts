import { isCompleteStatus, type StatusCategory } from "@/lib/status-category"
import { DEFAULT_STATUSES } from "@/components/board/board-types"
import { isMailboxActiveStatus } from "@/lib/mailbox-sla"
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { canAdminDeptSettings, departmentIdInScope } from "@/lib/dept-scope"
import type { Prisma } from "@/generated/prisma/client"

type SlaConfig = {
  pauseOutsideHours: boolean
  pauseWhenWaitingForCustomer: boolean
  firstResponseActiveStatuses: string[]
  atRiskPct: number
}
type BusinessHours = { timezone: string; workingDays: number[]; workStartTime: string; workEndTime: string }

const DEFAULT_SLA_CONFIG: SlaConfig = {
  pauseOutsideHours: false,
  pauseWhenWaitingForCustomer: true,
  firstResponseActiveStatuses: ["In Progress"],
  atRiskPct: 80,
}
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
    pauseWhenWaitingForCustomer:
      typeof stored.pauseWhenWaitingForCustomer === "boolean"
        ? stored.pauseWhenWaitingForCustomer
        : DEFAULT_SLA_CONFIG.pauseWhenWaitingForCustomer,
    firstResponseActiveStatuses: Array.isArray(stored.firstResponseActiveStatuses) ? stored.firstResponseActiveStatuses as string[] : DEFAULT_SLA_CONFIG.firstResponseActiveStatuses,
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

const SETTINGS_SELECT = {
  slaConfig: true, businessHours: true,
  subDepartments: { select: { id: true, statuses: { select: { label: true, category: true }, orderBy: { order: "asc" as const } } } },
} as const

function availableActiveStatuses(department: { subDepartments: { id: string; statuses: { label: string; category: StatusCategory }[] }[] }, subDepartmentId: string | null): string[] {
  const subs = subDepartmentId ? department.subDepartments.filter((sub) => sub.id === subDepartmentId) : department.subDepartments
  const workflows = subs.length ? subs.map((sub) => sub.statuses.length ? sub.statuses : DEFAULT_STATUSES) : [DEFAULT_STATUSES]
  return [...new Set(workflows.flat().filter((status) => !isCompleteStatus(status)).map((status) => status.label))]
}

function settingsBody(slaRaw: unknown, bhRaw: unknown, availableStatuses: string[]) {
  const slaConfig = readSlaConfig(slaRaw)
  return {
    slaConfig: { ...slaConfig, firstResponseActiveStatuses: slaConfig.firstResponseActiveStatuses.map((status) => availableStatuses.find((label) => isMailboxActiveStatus(label, [status])) ?? status) },
    businessHours: readBusinessHours(bhRaw),
    availableStatuses,
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
  // Readable by operational members in scope OR by anyone who can administer the
  // department's settings (tenant/dept admins) — the tenant-level Departments →
  // SLA page configures departments other than the caller's active one, so the
  // read gate must match the write gate (canAdminDeptSettings, used by PATCH).
  if (!(await departmentIdInScope(profile, id)) && !canAdminDeptSettings(profile, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const scope = await resolveSubDepartmentScope(id, req.nextUrl.searchParams.get("subDepartmentId"))
  if ("error" in scope) return scope.error

  const department = await prisma.department.findUnique({
    where: { id },
    select: SETTINGS_SELECT,
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

  return NextResponse.json(settingsBody(slaRaw, bhRaw, availableActiveStatuses(department, scope.subDepartmentId)))
}

/** PATCH /api/departments/:id/sla-settings — update pause-outside-hours + business calendar. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  if (!canAdminDeptSettings(profile, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const scope = await resolveSubDepartmentScope(id, body.subDepartmentId as string | undefined)
  if ("error" in scope) return scope.error

  const department = await prisma.department.findUnique({
    where: { id },
    select: SETTINGS_SELECT,
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

  const suppliedActiveStatuses = body.slaConfig?.firstResponseActiveStatuses
  if (suppliedActiveStatuses !== undefined && (!Array.isArray(suppliedActiveStatuses) || suppliedActiveStatuses.length > 20 || suppliedActiveStatuses.some((status: unknown) => typeof status !== "string" || status.length > 100))) {
    return NextResponse.json({ error: "Provide up to 20 first-response active status names." }, { status: 400 })
  }

  const nextSlaConfig = readSlaConfig({ ...readSlaConfig(baseSla), ...body.slaConfig })
  const nextBusinessHours = readBusinessHours({ ...readBusinessHours(baseBh), ...body.businessHours })

  if (!Number.isFinite(nextSlaConfig.atRiskPct) || nextSlaConfig.atRiskPct <= 0 || nextSlaConfig.atRiskPct > 100) {
    return NextResponse.json({ error: "atRiskPct must be between 1 and 100" }, { status: 400 })
  }

  if (!nextSlaConfig.firstResponseActiveStatuses.length || nextSlaConfig.firstResponseActiveStatuses.some((status) => typeof status !== "string" || !status.trim())) {
    return NextResponse.json({ error: "Provide at least one first-response active status." }, { status: 400 })
  }

  const availableStatuses = availableActiveStatuses(department, scope.subDepartmentId)
  if (suppliedActiveStatuses !== undefined) {
    const canonical = nextSlaConfig.firstResponseActiveStatuses.map((status) => availableStatuses.find((label) => isMailboxActiveStatus(label, [status.trim()])))
    if (canonical.some((status) => !status)) {
      return NextResponse.json({ error: "Select active statuses from this department's current workflows." }, { status: 400 })
    }
    nextSlaConfig.firstResponseActiveStatuses = [...new Set(canonical as string[])]
  }

  const timeFormat = /^(?:[01]\d|2[0-3]):[0-5]\d$/
  let timezoneValid = true
  try { new Intl.DateTimeFormat("en", { timeZone: nextBusinessHours.timezone }).format(new Date()) } catch { timezoneValid = false }
  if (!timezoneValid || !nextBusinessHours.workingDays.length || nextBusinessHours.workingDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) || !timeFormat.test(nextBusinessHours.workStartTime) || !timeFormat.test(nextBusinessHours.workEndTime) || nextBusinessHours.workEndTime <= nextBusinessHours.workStartTime) {
    return NextResponse.json({ error: "Provide a valid timezone, working days, and opening/closing times within the same day." }, { status: 400 })
  }

  const data = {
    slaConfig: {
      ...(baseSla && typeof baseSla === "object" && !Array.isArray(baseSla) ? baseSla as Record<string, Prisma.InputJsonValue> : {}),
      ...nextSlaConfig,
    } as Prisma.InputJsonValue,
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

  return NextResponse.json(settingsBody(updated.slaConfig, updated.businessHours, availableStatuses))
}
