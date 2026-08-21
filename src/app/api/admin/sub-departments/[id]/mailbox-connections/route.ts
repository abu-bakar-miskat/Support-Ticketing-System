import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAdminOrManager } from "@/lib/auth"
import { getProfileDeptScope } from "@/lib/dept-scope"
import { listMailboxConnectionsForSubDepartment, createMailboxConnection } from "@/lib/mailbox-connection"
import { assertFeatureEnabled } from "@/lib/feature-flags"

const AUTH_TYPES = ["RESEND", "OAUTH_M365", "OAUTH_GOOGLE", "IMAP"] as const
const IMPLEMENTED_AUTH_TYPES = new Set(["RESEND"])

type Params = { params: Promise<{ id: string }> }

async function loadSubDepartmentInScope(subDepartmentId: string, caller: { role: string }) {
  const subDepartment = await prisma.subDepartment.findUnique({
    where: { id: subDepartmentId },
    select: { id: true, departmentId: true, tenantId: true },
  })
  if (!subDepartment) return { subDepartment: null, error: NextResponse.json({ error: "Sub-department not found" }, { status: 404 }) }

  if (caller.role === "manager") {
    const deptScope = await getProfileDeptScope(caller as never)
    if (!deptScope?.allowedDeptIds.includes(subDepartment.departmentId)) {
      return { subDepartment: null, error: NextResponse.json({ error: "Sub-department is outside your scope" }, { status: 403 }) }
    }
  }
  return { subDepartment, error: null }
}

// EM-01/02/03 (sub-department scope): dedicated shared mailbox for a single
// sub-department. teamId/departmentId are always resolved from the URL, so
// callers can't connect a mailbox to any sub-department outside their scope.
export async function GET(_req: NextRequest, { params }: Params) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { id } = await params
  const { subDepartment, error: scopeError } = await loadSubDepartmentInScope(id, caller!)
  if (scopeError) return scopeError

  const connections = await listMailboxConnectionsForSubDepartment(subDepartment!.id)
  return NextResponse.json(connections)
}

export async function POST(req: NextRequest, { params }: Params) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { id } = await params
  const { subDepartment, error: scopeError } = await loadSubDepartmentInScope(id, caller!)
  if (scopeError) return scopeError

  const body = await req.json().catch(() => ({}))
  const { address, authType, plaintextCredentials } = body as {
    address?: string
    authType?: string
    plaintextCredentials?: string | null
  }

  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 })
  }
  const resolvedAuthType = authType ?? "RESEND"
  if (!AUTH_TYPES.includes(resolvedAuthType as never)) {
    return NextResponse.json({ error: `authType must be one of ${AUTH_TYPES.join(", ")}` }, { status: 400 })
  }
  if (!IMPLEMENTED_AUTH_TYPES.has(resolvedAuthType)) {
    return NextResponse.json({ error: `${resolvedAuthType} is not implemented yet` }, { status: 400 })
  }

  const featureCheck = await assertFeatureEnabled(subDepartment!.tenantId, "mailboxConnections")
  if (!featureCheck.ok) {
    return NextResponse.json({ error: featureCheck.error }, { status: 403 })
  }

  try {
    const connection = await createMailboxConnection({
      tenantId: subDepartment!.tenantId,
      departmentId: subDepartment!.departmentId,
      subDepartmentId: subDepartment!.id,
      scopeType: "SUB_DEPARTMENT",
      address,
      authType: resolvedAuthType as never,
      plaintextCredentials,
    })
    return NextResponse.json(connection, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "That address is already connected" }, { status: 409 })
    }
    throw err
  }
}
