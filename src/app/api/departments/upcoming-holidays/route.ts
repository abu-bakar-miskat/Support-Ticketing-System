import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { getProfileDeptScope } from "@/lib/dept-scope"

// GET /api/departments/upcoming-holidays
// Top-bar indicator data for the active department: holidays in the next 7 days
// and events within the next 2 days. Empty when there's no active department.
export async function GET() {
  const { profile, error } = await requireAuth()
  if (error) return error

  const deptScope = await getProfileDeptScope(profile)
  if (!deptScope) return NextResponse.json({ holidays: [], events: [] })

  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const holidayTo = new Date(from)
  holidayTo.setDate(holidayTo.getDate() + 7)
  // Events within the next 2 days (today through today + 2 days).
  const eventTo = new Date(from)
  eventTo.setDate(eventTo.getDate() + 2)

  const [holidays, events] = await Promise.all([
    prisma.departmentHoliday.findMany({
      where: { departmentId: deptScope.activeDeptId, startDate: { lte: holidayTo }, endDate: { gte: from } },
      orderBy: { startDate: "asc" },
      select: { id: true, name: true, startDate: true, endDate: true },
    }),
    prisma.departmentEvent.findMany({
      where: { departmentId: deptScope.activeDeptId, startDate: { lte: eventTo }, endDate: { gte: from } },
      orderBy: { startDate: "asc" },
      select: { id: true, title: true, type: true, startDate: true, endDate: true },
    }),
  ])

  return NextResponse.json({ holidays, events })
}
