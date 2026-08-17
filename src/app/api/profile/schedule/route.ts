import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"

export async function GET(_req: NextRequest) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const schedule = await prisma.memberSchedule.findUnique({
    where: { userId: profile!.id },
  })

  return NextResponse.json({ schedule })
}

export async function PUT(req: NextRequest) {
  const { profile, error } = await requireAuth()
  if (error) return error

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

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  const schedule = await prisma.memberSchedule.upsert({
    where: { userId: profile!.id },
    create: { userId: profile!.id, ...data },
    update: data,
  })

  return NextResponse.json(schedule)
}
