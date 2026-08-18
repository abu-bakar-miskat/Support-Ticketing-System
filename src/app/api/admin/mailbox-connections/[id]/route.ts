import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAdminOrManager } from "@/lib/auth"
import { getProfileDeptScope } from "@/lib/dept-scope"
import { updateMailboxConnection, deleteMailboxConnection } from "@/lib/mailbox-connection"

async function assertScope(caller: { role: string }, departmentId: string): Promise<NextResponse | null> {
  if (caller.role !== "manager") return null
  const deptScope = await getProfileDeptScope(caller as never)
  if (!deptScope?.allowedDeptIds.includes(departmentId)) {
    return NextResponse.json({ error: "Connection is outside your scope" }, { status: 403 })
  }
  return null
}

export async function PATCH(
  req: NextRequest,
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

  const body = await req.json().catch(() => ({}))
  const { address, plaintextCredentials } = body as { address?: string; plaintextCredentials?: string | null }

  const updated = await updateMailboxConnection(id, { address, plaintextCredentials })
  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { id } = await params
  const existing = await prisma.mailboxConnection.findUnique({ where: { id }, select: { departmentId: true } })
  if (!existing) {
    return new NextResponse(null, { status: 204 })
  }
  const scopeError = await assertScope(caller!, existing.departmentId)
  if (scopeError) return scopeError

  await deleteMailboxConnection(id)
  return new NextResponse(null, { status: 204 })
}
