import "server-only"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { assertFeatureEnabled } from "@/lib/feature-flags"
import { resolveReportScope, type ReportScope } from "./report-scope"
import { scheduleInputSchema, type ScheduleInput, type ScheduleSettings } from "./schedule-settings"
import { scheduledReportRange } from "./schedule-calendar"

export async function requireScheduleAdmin() {
  const { profile, error } = await requireAuth()
  if (error) return { error }
  const scope = await resolveReportScope(profile)
  if (scope.kind !== "cross_department") return { error: NextResponse.json({ error: "Scheduled reports require tenant admin access" }, { status: 403 }) }
  return { profile, tenantId: scope.tenantId }
}
export function parseScheduleInput(body: unknown, draft = false): ScheduleInput {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {}
  return scheduleInputSchema.parse(draft ? { ...input, name: typeof input.name === "string" && input.name.trim() ? input.name : "User performance report" } : input)
}
export function scheduleError(error: unknown) {
  const message = error && typeof error === "object" && "issues" in error
    ? (error as { issues: { message: string }[] }).issues[0]?.message
    : error instanceof Error ? error.message : "Could not process the report"
  return NextResponse.json({ error: message }, { status: 400 })
}
export async function checkScheduledExportsEnabled(tenantId: string) {
  const feature = await assertFeatureEnabled(tenantId, "customReports")
  if (!feature.ok) throw new Error(feature.error)
}
/** Revalidate saved selections at each run. Deleted departments never widen to all departments. */
export async function resolveScheduleSelection(tenantId: string, settings: ScheduleSettings | null): Promise<{ scope: ReportScope; scopeLabel: string }> {
  let scope: ReportScope = { kind: "cross_department", tenantId }
  let departmentName = "All departments"
  if (settings && settings.departmentId !== "all") {
    const department = await prisma.department.findFirst({
      where: { id: settings.departmentId, tenantId },
      select: { name: true, subDepartments: { where: { tenantId }, select: { id: true } } },
    })
    if (!department) throw new Error("The selected department is no longer available in this tenant")
    scope = { kind: "department", tenantId, subDepartmentIds: department.subDepartments.map((sub) => sub.id) }
    departmentName = department.name
  }
  let personName = "Everyone"
  if (settings && settings.personId !== "all") {
    const person = await prisma.profile.findFirst({
      where: {
        id: settings.personId, deletedAt: null,
        tenantMemberships: { some: { tenantId, isActive: true } },
        ...(scope.kind === "department" ? { memberships: { some: { subDepartmentId: { in: scope.subDepartmentIds }, isActive: true } } } : {}),
      }, select: { name: true },
    })
    if (!person) throw new Error("The selected person is no longer an active member of this report scope")
    personName = person.name
  }
  return { scope, scopeLabel: `${departmentName} · ${personName}` }
}
export async function prepareScheduleReport(tenantId: string, settings: ScheduleSettings | null, rangeDays: number, runAt = new Date()) {
  await checkScheduledExportsEnabled(tenantId)
  const { scope, scopeLabel } = await resolveScheduleSelection(tenantId, settings)
  const { start, end } = scheduledReportRange(settings, rangeDays, runAt)
  return { scope, reportParams: { start: start.toISOString(), end: end.toISOString(), personId: settings?.personId ?? "all", scopeLabel, timezone: settings?.timezone ?? "UTC" } }
}
