import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { resolveReportScope } from "@/lib/reporting/report-scope"

async function authorize(id: string) {
  const { profile, error } = await requireAuth()
  if (error) return { error }
  const scope = await resolveReportScope(profile!)
  if (scope.kind !== "cross_department") {
    return { error: NextResponse.json({ error: "Scheduled reports require Project Admin access" }, { status: 403 }) }
  }
  const schedule = await prisma.reportSchedule.findUnique({ where: { id } })
  if (!schedule || schedule.tenantId !== scope.tenantId) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) }
  }
  return { schedule }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await authorize(id)
  if (error) return error

  const body = await req.json().catch(() => ({}))
  const data: { enabled?: boolean } = {}
  if (typeof body?.enabled === "boolean") data.enabled = body.enabled

  const updated = await prisma.reportSchedule.update({ where: { id }, data })
  return NextResponse.json({ schedule: updated })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await authorize(id)
  if (error) return error

  await prisma.reportSchedule.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
