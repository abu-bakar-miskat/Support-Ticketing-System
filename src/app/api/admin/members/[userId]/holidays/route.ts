import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager } from "@/lib/auth"
import { managerCanManageUser } from "@/lib/dept-scope"
import { syncAgentUnavailableFlagForUser } from "@/lib/agent-unavailable"

async function assertMemberScope(targetUserId: string, caller: Parameters<typeof managerCanManageUser>[0]): Promise<NextResponse | null> {
  if (await managerCanManageUser(caller, targetUserId)) return null
  return NextResponse.json({ error: "User is outside your department scope" }, { status: 403 })
}

// POST — add a holiday date for a member
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { userId } = await params
  const scopeError = await assertMemberScope(userId, caller!)
  if (scopeError) return scopeError

  const body = await req.json()
  const { date, startDate, endDate, reason } = body as {
    date?: string
    startDate?: string
    endDate?: string
    reason?: string
  }

  const rangeStart = startDate ?? date
  const rangeEnd = endDate ?? startDate ?? date

  if (!rangeStart) return NextResponse.json({ error: "date is required" }, { status: 400 })

  const start = new Date(rangeStart)
  const end = new Date(rangeEnd!)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 })
  }
  if (end < start) return NextResponse.json({ error: "endDate must not be before startDate" }, { status: 400 })

  const dates: Date[] = []
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(new Date(d))
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
