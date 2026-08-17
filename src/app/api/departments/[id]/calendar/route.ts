import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { forbidden } from "@/lib/api-response"
import { canManageDeptCalendar, departmentIdInScope } from "@/lib/dept-scope"

// GET /api/departments/[id]/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
// Members of the department (team + direct), their schedules, their off-days in
// the window, plus department-wide holidays overlapping the window.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id: departmentId } = await params
  if (!(await departmentIdInScope(profile, departmentId))) {
    return forbidden("You don't have access to this department.")
  }

  const { searchParams } = new URL(req.url)
  const fromStr = searchParams.get("from")
  const toStr = searchParams.get("to")
  const now = new Date()
  const from = fromStr ? new Date(fromStr) : new Date(now.getFullYear(), now.getMonth(), 1)
  const to = toStr ? new Date(toStr) : new Date(now.getFullYear(), now.getMonth() + 1, 0)
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: "Invalid from/to date" }, { status: 400 })
  }

  const teams = await prisma.team.findMany({
    where: { departmentId },
    select: { id: true },
  })
  const teamIds = teams.map((t) => t.id)

  const [teamMembers, directMembers] = await Promise.all([
    teamIds.length > 0
      ? prisma.teamMembership.findMany({
          where: { teamId: { in: teamIds }, isActive: true },
          select: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
        })
      : Promise.resolve([]),
    prisma.departmentMember.findMany({
      where: { departmentId },
      select: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    }),
  ])

  const memberMap = new Map<string, { id: string; name: string; email: string; avatarUrl: string | null }>()
  for (const row of [...teamMembers, ...directMembers]) {
    if (row.user) memberMap.set(row.user.id, row.user)
  }
  const memberIds = [...memberMap.keys()]

  const [schedules, holidays, departmentHolidays, departmentEvents] = await Promise.all([
    memberIds.length > 0
      ? prisma.memberSchedule.findMany({ where: { userId: { in: memberIds } } })
      : Promise.resolve([]),
    memberIds.length > 0
      ? prisma.memberHoliday.findMany({
          where: { userId: { in: memberIds }, date: { gte: from, lte: to } },
          orderBy: { date: "asc" },
        })
      : Promise.resolve([]),
    // Holidays / events overlapping the window: start <= to AND end >= from
    prisma.departmentHoliday.findMany({
      where: { departmentId, startDate: { lte: to }, endDate: { gte: from } },
      orderBy: { startDate: "asc" },
    }),
    prisma.departmentEvent.findMany({
      where: { departmentId, startDate: { lte: to }, endDate: { gte: from } },
      orderBy: { startDate: "asc" },
    }),
  ])

  const scheduleByUser = new Map(schedules.map((s) => [s.userId, s]))
  const holidaysByUser = new Map<string, { id: string; date: Date; reason: string | null }[]>()
  for (const h of holidays) {
    const list = holidaysByUser.get(h.userId) ?? []
    list.push({ id: h.id, date: h.date, reason: h.reason })
    holidaysByUser.set(h.userId, list)
  }

  const members = [...memberMap.values()]
    .map((u) => {
      const s = scheduleByUser.get(u.id)
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        avatarUrl: u.avatarUrl,
        schedule: s
          ? { workingDays: s.workingDays, workStartTime: s.workStartTime, workEndTime: s.workEndTime }
          : null,
        holidays: holidaysByUser.get(u.id) ?? [],
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({
    canManage: canManageDeptCalendar(profile, departmentId),
    members,
    departmentHolidays: departmentHolidays.map((h) => ({
      id: h.id,
      name: h.name,
      startDate: h.startDate,
      endDate: h.endDate,
    })),
    events: departmentEvents.map((e) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      startDate: e.startDate,
      endDate: e.endDate,
    })),
  })
}
