import { NextRequest, NextResponse } from "next/server"
import { requireAuth, assertDepartmentAdmin } from "@/lib/auth"
import { listMailboxConnections } from "@/lib/mailbox-connection"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile: caller, error } = await requireAuth()
  if (error) return error

  const { id: departmentId } = await params
  const scopeError = assertDepartmentAdmin(caller!, departmentId)
  if (scopeError) return scopeError

  const connections = await listMailboxConnections(departmentId)
  return NextResponse.json(connections)
}

// Mailboxes are connected by signing in with Microsoft — see
// /api/admin/mailbox-oauth/[provider]/start — not created through this route.
