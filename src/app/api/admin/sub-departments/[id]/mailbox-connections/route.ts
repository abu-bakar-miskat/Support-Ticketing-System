import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth, assertDepartmentAdmin } from "@/lib/auth"
import { listMailboxConnectionsForSubDepartment } from "@/lib/mailbox-connection"

type Params = { params: Promise<{ id: string }> }

async function loadSubDepartmentInScope(
  subDepartmentId: string,
  caller: Parameters<typeof assertDepartmentAdmin>[0],
) {
  const subDepartment = await prisma.subDepartment.findUnique({
    where: { id: subDepartmentId },
    select: { id: true, departmentId: true, tenantId: true },
  })
  if (!subDepartment) return { subDepartment: null, error: NextResponse.json({ error: "Sub-department not found" }, { status: 404 }) }

  // Mailbox connections are department admin-only (role-hierarchy.md): a tenant
  // admin or an Admin of the sub-department's parent department may manage them.
  const scopeError = assertDepartmentAdmin(caller, subDepartment.departmentId)
  if (scopeError) return { subDepartment: null, error: scopeError }
  return { subDepartment, error: null }
}

// EM-01/02/03 (sub-department scope): dedicated shared mailbox for a single
// sub-department. teamId/departmentId are always resolved from the URL, so
// callers can't connect a mailbox to any sub-department outside their scope.
export async function GET(_req: NextRequest, { params }: Params) {
  const { profile: caller, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const { subDepartment, error: scopeError } = await loadSubDepartmentInScope(id, caller!)
  if (scopeError) return scopeError

  const connections = await listMailboxConnectionsForSubDepartment(subDepartment!.id)
  return NextResponse.json(connections)
}

// Mailboxes are connected by signing in with Microsoft — see
// /api/admin/mailbox-oauth/[provider]/start — not created through this route.
