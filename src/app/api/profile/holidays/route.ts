import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { syncAgentUnavailableFlagForUser } from "@/lib/agent-unavailable"

// Self-service counterpart of /api/admin/members/[userId]/holidays — every user
// may manage their own individual holidays.

export async function GET() {
  const { profile, error } = await requireAuth()
  if (error) return error

  const holidays = await prisma.memberHoliday.findMany({
    where: { userId: profile!.id },
    orderBy: { date: "asc" },
  })

  return NextResponse.json(holidays)
}

// POST — add a holiday date range for the current user
export async function POST(req: NextRequest) {
  const { profile, error } = await requireAuth()
  if (error) return error
  const userId = profile!.id

  const body = await req.json()
  const { startDate, endDate, reason } = body as {
    startDate?: string
    endDate?: string
    reason?: string
  }

  if (!startDate) return NextResponse.json({ error: "startDate is required" }, { status: 400 })

  const start = new Date(startDate)
  const end = new Date(endDate ?? startDate)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 })
  }
  if (end < start) return NextResponse.json({ error: "endDate must not be before startDate" }, { status: 400 })

  const dates: Date[] = []
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(new Date(d))
  }
  if (dates.length > 366) {
    return NextResponse.json({ error: "Holiday range cannot exceed one year" }, { status: 400 })
  }

  const holidays = await Promise.all(
    dates.map((d) =>
      prisma.memberHoliday.upsert({
        where: { userId_date: { userId, date: d } },
        create: { userId, date: d, reason: reason ?? null },
        update: { reason: reason ?? null },
      }),
    ),
  )

  await syncAgentUnavailableFlagForUser(userId)

  return NextResponse.json(holidays, { status: 201 })
}
