import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager } from "@/lib/auth"
import { managerCanManageUser } from "@/lib/dept-scope"

async function assertMemberScope(targetUserId: string, caller: Parameters<typeof managerCanManageUser>[0]): Promise<NextResponse | null> {
  if (await managerCanManageUser(caller, targetUserId)) return null
  return NextResponse.json({ error: "User is outside your department scope" }, { status: 403 })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { userId } = await params
  const scopeError = await assertMemberScope(userId, caller!)
  if (scopeError) return scopeError

  const [schedule, holidays] = await Promise.all([
    prisma.memberSchedule.findUnique({ where: { userId } }),
    prisma.memberHoliday.findMany({
      where: { userId },
      orderBy: { date: "asc" },
    }),
  ])

  return NextResponse.json({ schedule, holidays })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { userId } = await params
  const scopeError = await assertMemberScope(userId, caller!)
  if (scopeError) return scopeError

  const body = await req.json()
  const { workingDays, workStartTime, workEndTime } = body as {
    workingDays?: number[]
    workStartTime?: string
    workEndTime?: string
  }

  const data: {
    workingDays?: number[]
    workStartTime?: string
    workEndTime?: string
  } = {}
  if (workingDays !== undefined) data.workingDays = workingDays
  if (workStartTime !== undefined) data.workStartTime = workStartTime
  if (workEndTime !== undefined) data.workEndTime = workEndTime

  const schedule = await prisma.memberSchedule.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  })

  return NextResponse.json(schedule)
}
