import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAdminOrManager } from "@/lib/auth"
import { getProfileDeptScope } from "@/lib/dept-scope"
import { isDepartmentOperational, completeDepartmentSetup } from "@/lib/department-setup"

async function assertScope(caller: { role: string }, departmentId: string): Promise<NextResponse | null> {
  if (caller.role !== "manager") return null
  const deptScope = await getProfileDeptScope(caller as never)
  if (!deptScope?.allowedDeptIds.includes(departmentId)) {
    return NextResponse.json({ error: "Department is outside your scope" }, { status: 403 })
  }
  return null
}

// DS-08: setup status for the given department.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { id: departmentId } = await params
  const scopeError = await assertScope(caller!, departmentId)
  if (scopeError) return scopeError

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { setupCompletedAt: true },
  })
  if (!department) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 })
  }

  return NextResponse.json({
    isOperational: department.setupCompletedAt != null,
    setupCompletedAt: department.setupCompletedAt,
  })
}

// DS-08: marks the initial setup review complete, unblocking ticket creation.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { id: departmentId } = await params
  const scopeError = await assertScope(caller!, departmentId)
  if (scopeError) return scopeError

  if (await isDepartmentOperational(departmentId)) {
    return NextResponse.json({ ok: true, alreadyComplete: true })
  }

  await completeDepartmentSetup(departmentId)
  return NextResponse.json({ ok: true })
}
