import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAdminOrManager, managerDeptScope } from "@/lib/auth"

export async function GET() {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error

  const deptScope = managerDeptScope(profile!)
  const forms = await prisma.intakeFormConfig.findMany({
    where: deptScope
      ? { departmentId: { in: [...deptScope] } }
      : { department: { tenantId: profile!.activeTenantId ?? "__no_tenant__" } },
    orderBy: { createdAt: "desc" },
    include: {
      department: { select: { id: true, name: true } },
      intakeTeam: { select: { id: true, name: true } },
      _count: { select: { intakes: true } },
    },
  })
  return NextResponse.json(forms)
}

export async function POST(request: Request) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error

  const body = await request.json()
  const name = (body.name as string)?.trim()
  const departmentId = (body.departmentId as string)?.trim()
  const intakeTeamId = (body.intakeTeamId as string)?.trim()
  const workloadThreshold =
    typeof body.workloadThreshold === "number" ? body.workloadThreshold : undefined
  const autoAssign = typeof body.autoAssign === "boolean" ? body.autoAssign : undefined
  const displayMode =
    body.displayMode === "FORM" || body.displayMode === "CHAT" ? body.displayMode : undefined

  if (!name || !departmentId || !intakeTeamId) {
    return NextResponse.json(
      { error: "name, departmentId, and intakeTeamId are required" },
      { status: 400 },
    )
  }

  const deptScope = managerDeptScope(profile!)
  if (deptScope && !deptScope.has(departmentId)) {
    return NextResponse.json(
      { error: "Forbidden: department is outside your scope" },
      { status: 403 },
    )
  }

  // Verify the intake team belongs to the department
  const team = await prisma.team.findUnique({
    where: { id: intakeTeamId },
    select: { departmentId: true },
  })
  if (!team) {
    return NextResponse.json({ error: "Intake team not found" }, { status: 404 })
  }
  if (team.departmentId !== departmentId) {
    return NextResponse.json(
      { error: "Intake team must belong to the selected department" },
      { status: 400 },
    )
  }

  if (workloadThreshold !== undefined) {
    await prisma.team.update({
      where: { id: intakeTeamId },
      data: { workloadThreshold },
    })
  }

  const form = await prisma.intakeFormConfig.create({
    data: {
      name,
      departmentId,
      intakeTeamId,
      ...(autoAssign !== undefined ? { autoAssign } : {}),
      ...(displayMode !== undefined ? { displayMode } : {}),
    },
    include: {
      department: { select: { id: true, name: true } },
      intakeTeam: { select: { id: true, name: true } },
    },
  })
  return NextResponse.json(form, { status: 201 })
}
