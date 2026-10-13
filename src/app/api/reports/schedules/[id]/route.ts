import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { runAsSystem } from "@/lib/request-scope"
import { requireScheduleAdmin, parseScheduleInput, resolveScheduleSelection, checkScheduledExportsEnabled, scheduleError } from "@/lib/reporting/schedule-service"
import { nextScheduledRun } from "@/lib/reporting/schedule-calendar"
import { readScheduleSettings } from "@/lib/reporting/schedule-settings"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireScheduleAdmin()
  if (auth.error) return auth.error
  const { id } = await params
  return runAsSystem(async () => {
    const schedule = await prisma.reportSchedule.findFirst({ where: { id, tenantId: auth.tenantId } })
    if (!schedule) return NextResponse.json({ error: "Schedule not found" }, { status: 404 })
    try {
      const body = await req.json()
      let data
      if (typeof body.enabled === "boolean" && Object.keys(body).length === 1) {
        const settings = readScheduleSettings(schedule.settings)
        data = { enabled: body.enabled, ...(body.enabled && settings ? { nextRunAt: nextScheduledRun(schedule.frequency, settings, new Date()) } : {}) }
      } else {
        const input = parseScheduleInput(body)
        await checkScheduledExportsEnabled(auth.tenantId)
        await resolveScheduleSelection(auth.tenantId, input.settings)
        data = { ...input, nextRunAt: nextScheduledRun(input.frequency, input.settings, new Date()) }
      }
      const updated = await prisma.reportSchedule.update({ where: { id }, data })
      return NextResponse.json({ schedule: updated })
    } catch (error) { return scheduleError(error) }
  })
}
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireScheduleAdmin()
  if (auth.error) return auth.error
  const { id } = await params
  const deleted = await prisma.reportSchedule.deleteMany({ where: { id, tenantId: auth.tenantId } })
  if (!deleted.count) return NextResponse.json({ error: "Schedule not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
