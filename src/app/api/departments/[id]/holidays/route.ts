import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { forbidden } from "@/lib/api-response"
import { canManageDeptCalendar } from "@/lib/dept-scope"

// POST /api/departments/[id]/holidays — add a department-wide holiday.
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

  const body = await req.json()
  const name = typeof body.name === "string" ? body.name.trim() : ""
  const { startDate, endDate } = body as { startDate?: string; endDate?: string }

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 })
  if (!startDate) return NextResponse.json({ error: "startDate is required" }, { status: 400 })

  const start = new Date(startDate)
  const end = new Date(endDate ?? startDate)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 })
  }
  if (end < start) {
    return NextResponse.json({ error: "endDate must not be before startDate" }, { status: 400 })
  }

  const holiday = await prisma.departmentHoliday.create({
    data: { departmentId, name, startDate: start, endDate: end, createdBy: profile.id },
  })

  return NextResponse.json(holiday, { status: 201 })
}
