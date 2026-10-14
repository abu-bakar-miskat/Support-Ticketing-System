import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { runAsSystem } from "@/lib/request-scope"
import { nextScheduledRun } from "@/lib/reporting/schedule-calendar"
import { parseScheduleInput, requireScheduleAdmin, resolveScheduleSelection, checkScheduledExportsEnabled, scheduleError } from "@/lib/reporting/schedule-service"

export async function GET() {
  const auth = await requireScheduleAdmin()
  if (auth.error) return auth.error
  return runAsSystem(async () => {
    const [schedules, departments, people] = await Promise.all([
      prisma.reportSchedule.findMany({ where: { tenantId: auth.tenantId }, orderBy: { createdAt: "desc" } }),
      prisma.department.findMany({ where: { tenantId: auth.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.profile.findMany({
        where: { deletedAt: null, tenantMemberships: { some: { tenantId: auth.tenantId, isActive: true } } },
        select: { id: true, name: true, memberships: { where: { isActive: true, subDepartment: { tenantId: auth.tenantId } }, select: { subDepartment: { select: { departmentId: true } } } } },
        orderBy: { name: "asc" },
      }),
    ])
    return NextResponse.json({ schedules, departments, people: people.map((person) => ({ id: person.id, name: person.name, departmentIds: [...new Set(person.memberships.map((m) => m.subDepartment.departmentId).filter(Boolean))] })) })
  })
}
export async function POST(req: NextRequest) {
  const auth = await requireScheduleAdmin()
  if (auth.error) return auth.error
  return runAsSystem(async () => {
    try {
      const input = parseScheduleInput(await req.json())
      await checkScheduledExportsEnabled(auth.tenantId)
      await resolveScheduleSelection(auth.tenantId, input.settings)
      const schedule = await prisma.reportSchedule.create({ data: {
        ...input, tenantId: auth.tenantId, createdById: auth.profile.id,
        nextRunAt: nextScheduledRun(input.frequency, input.settings, new Date()),
      } })
      return NextResponse.json({ schedule }, { status: 201 })
    } catch (error) { return scheduleError(error) }
  })
}
