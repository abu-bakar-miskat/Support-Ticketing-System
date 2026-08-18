import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager } from "@/lib/auth"
import { managerCanManageUser } from "@/lib/dept-scope"
import { syncAgentUnavailableFlagForUser } from "@/lib/agent-unavailable"

async function assertMemberScope(targetUserId: string, caller: Parameters<typeof managerCanManageUser>[0]): Promise<NextResponse | null> {
  if (await managerCanManageUser(caller, targetUserId)) return null
  return NextResponse.json({ error: "User is outside your department scope" }, { status: 403 })
}

// DELETE — remove a holiday
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string; holidayId: string }> },
) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { userId, holidayId } = await params
  const scopeError = await assertMemberScope(userId, caller!)
  if (scopeError) return scopeError

  await prisma.memberHoliday.deleteMany({
    where: { id: holidayId, userId },
  })

  await syncAgentUnavailableFlagForUser(userId)

  return new NextResponse(null, { status: 204 })
}
