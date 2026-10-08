import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { syncAgentUnavailableFlagForUser } from "@/lib/agent-unavailable"

// DELETE — remove one of the current user's own holidays
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ holidayId: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { holidayId } = await params
  await prisma.memberHoliday.deleteMany({
    where: { id: holidayId, userId: profile!.id },
  })

  await syncAgentUnavailableFlagForUser(profile!.id)

  return new NextResponse(null, { status: 204 })
}
