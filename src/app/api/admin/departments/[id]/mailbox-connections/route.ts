import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAdminOrManager } from "@/lib/auth"
import { getProfileDeptScope } from "@/lib/dept-scope"
import { listMailboxConnections, createMailboxConnection } from "@/lib/mailbox-connection"

const AUTH_TYPES = ["RESEND", "OAUTH_M365", "OAUTH_GOOGLE", "IMAP"] as const
const SCOPE_TYPES = ["DEPARTMENT", "SUB_DEPARTMENT"] as const

// Only RESEND is a functional provider today (D-10/EM-05) — OAuth/IMAP land
// behind lib/mail-providers later, so creating a connection with one of those
// auth types is rejected rather than silently accepted and never working.
const IMPLEMENTED_AUTH_TYPES = new Set(["RESEND"])

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { id: departmentId } = await params
  if (caller!.role === "manager") {
    const deptScope = await getProfileDeptScope(caller!)
    if (!deptScope?.allowedDeptIds.includes(departmentId)) {
      return NextResponse.json({ error: "Department is outside your scope" }, { status: 403 })
    }
  }

  const connections = await listMailboxConnections(departmentId)
  return NextResponse.json(connections)
}

// EM-01/02/03: connect a mailbox to a department or one of its sub-departments
// (teamId). NFR-03: any plaintextCredentials in the body are encrypted before
// storage and never echoed back — the response is the same credential-free
// shape as GET.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { id: departmentId } = await params
  if (caller!.role === "manager") {
    const deptScope = await getProfileDeptScope(caller!)
    if (!deptScope?.allowedDeptIds.includes(departmentId)) {
      return NextResponse.json({ error: "Department is outside your scope" }, { status: 403 })
    }
  }

  const body = await req.json().catch(() => ({}))
  const { teamId, scopeType, address, authType, plaintextCredentials } = body as {
    teamId?: string
    scopeType?: string
    address?: string
    authType?: string
    plaintextCredentials?: string | null
  }

  if (!teamId || !scopeType || !address) {
    return NextResponse.json({ error: "teamId, scopeType, and address are required" }, { status: 400 })
  }
  if (!SCOPE_TYPES.includes(scopeType as never)) {
    return NextResponse.json({ error: `scopeType must be one of ${SCOPE_TYPES.join(", ")}` }, { status: 400 })
  }
  const resolvedAuthType = authType ?? "RESEND"
  if (!AUTH_TYPES.includes(resolvedAuthType as never)) {
    return NextResponse.json({ error: `authType must be one of ${AUTH_TYPES.join(", ")}` }, { status: 400 })
  }
  if (!IMPLEMENTED_AUTH_TYPES.has(resolvedAuthType)) {
    return NextResponse.json({ error: `${resolvedAuthType} is not implemented yet` }, { status: 400 })
  }

  const [department, team] = await Promise.all([
    prisma.department.findUnique({ where: { id: departmentId }, select: { id: true, tenantId: true } }),
    prisma.subDepartment.findUnique({ where: { id: teamId }, select: { id: true, departmentId: true } }),
  ])
  if (!department) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 })
  }
  if (!team || team.departmentId !== departmentId) {
    return NextResponse.json({ error: "teamId must belong to the given department" }, { status: 404 })
  }

  try {
    const connection = await createMailboxConnection({
      tenantId: department.tenantId,
      departmentId,
      subDepartmentId: teamId,
      scopeType: scopeType as never,
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
