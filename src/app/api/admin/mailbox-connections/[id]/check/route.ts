import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAdminOrManager } from "@/lib/auth"
import { getProfileDeptScope } from "@/lib/dept-scope"
import { checkMailboxConnectionHealth, getMailboxConnectionSafe } from "@/lib/mailbox-connection"

async function assertScope(caller: { role: string }, departmentId: string): Promise<NextResponse | null> {
  if (caller.role !== "manager") return null
  const deptScope = await getProfileDeptScope(caller as never)
  if (!deptScope?.allowedDeptIds.includes(departmentId)) {
    return NextResponse.json({ error: "Connection is outside your scope" }, { status: 403 })
  }
  return null
}

// Manual "test connection" from the mailbox UI. Runs the same provider health
// check as the scheduled sweep but suppresses the failure alert email so an
// admin poking the button can't spam the department manager.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { id } = await params
  const existing = await prisma.mailboxConnection.findUnique({ where: { id }, select: { departmentId: true } })
  if (!existing) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 })
  }
  const scopeError = await assertScope(caller!, existing.departmentId)
  if (scopeError) return scopeError

  await checkMailboxConnectionHealth(id, new Date(), { notifyOnNewFailure: false })

  const updated = await getMailboxConnectionSafe(id)
  if (!updated) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 })
  }
  return NextResponse.json(updated)
}
