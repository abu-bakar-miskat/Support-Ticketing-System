import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { forbidden } from "@/lib/api-response"
import { canManageDeptCalendar } from "@/lib/dept-scope"

type RawHoliday = { name?: unknown; startDate?: unknown; endDate?: unknown; date?: unknown }

// POST /api/departments/[id]/holidays/import — bulk-add department holidays from JSON.
// Accepts either a bare array or { holidays: [...] }. Each item: { name, startDate, endDate? }
// (or a single `date`). Validates every row up front and rejects the whole batch on any error
// so a partial import never leaves a half-populated calendar.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id: departmentId } = await params
  if (!canManageDeptCalendar(profile, departmentId)) {
    return forbidden("Only managers of this department can edit its calendar.")
  }

  const body = await req.json().catch(() => null)
  const rows: unknown = Array.isArray(body) ? body : (body as { holidays?: unknown })?.holidays
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json(
      { error: "Expected a non-empty JSON array of holidays." },
      { status: 400 },
    )
  }

  const data: { departmentId: string; name: string; startDate: Date; endDate: Date; createdBy: string }[] = []
  const errors: string[] = []

  rows.forEach((raw, i) => {
    const row = raw as RawHoliday
    const name = typeof row.name === "string" ? row.name.trim() : ""
    const startRaw = typeof row.startDate === "string" ? row.startDate : typeof row.date === "string" ? row.date : ""
    const endRaw = typeof row.endDate === "string" ? row.endDate : startRaw

    if (!name) return errors.push(`Row ${i + 1}: "name" is required.`)
    if (!startRaw) return errors.push(`Row ${i + 1}: "startDate" is required.`)

    const start = new Date(startRaw)
    const end = new Date(endRaw)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return errors.push(`Row ${i + 1}: invalid date.`)
    }
    if (end < start) return errors.push(`Row ${i + 1}: endDate is before startDate.`)

    data.push({ departmentId, name, startDate: start, endDate: end, createdBy: profile.id })
  })

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(" ") }, { status: 400 })
  }

  const result = await prisma.departmentHoliday.createMany({ data })
  return NextResponse.json({ imported: result.count }, { status: 201 })
}
