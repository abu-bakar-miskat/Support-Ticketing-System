import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAdminOrManager, managerDeptScope } from "@/lib/auth"
import { assertTemplateFeatureEnabled } from "@/lib/template-catalogue"

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
      intakeSubDepartment: { select: { id: true, name: true } },
      _count: { select: { intakes: true } },
    },
  })
  return NextResponse.json(forms)
}

export async function POST(request: Request) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error

  const featureCheck = await assertTemplateFeatureEnabled(profile!.activeTenantId ?? "__no_tenant__", "supportForm")
  if (!featureCheck.ok) {
    return NextResponse.json({ error: featureCheck.error }, { status: 403 })
  }

  const body = await request.json()
  const name = (body.name as string)?.trim()
  const departmentId = (body.departmentId as string)?.trim()
  const intakeSubDepartmentId = (body.intakeSubDepartmentId as string)?.trim()
  const workloadThreshold =
    typeof body.workloadThreshold === "number" ? body.workloadThreshold : undefined
  const autoAssign = typeof body.autoAssign === "boolean" ? body.autoAssign : undefined
  const displayMode =
    body.displayMode === "FORM" || body.displayMode === "CHAT" ? body.displayMode : undefined

  if (!name || !departmentId || !intakeSubDepartmentId) {
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
  const subDepartment = await prisma.subDepartment.findUnique({
    where: { id: intakeSubDepartmentId },
    select: { departmentId: true },
  })
  if (!subDepartment) {
    return NextResponse.json({ error: "Intake team not found" }, { status: 404 })
  }
  if (subDepartment.departmentId !== departmentId) {
    return NextResponse.json(
      { error: "Intake team must belong to the selected department" },
      { status: 400 },
    )
  }

  if (workloadThreshold !== undefined) {
    await prisma.subDepartment.update({
      where: { id: intakeSubDepartmentId },
      data: { workloadThreshold },
    })
  }

  const form = await prisma.intakeFormConfig.create({
    data: {
      name,
      departmentId,
      intakeSubDepartmentId,
      ...(autoAssign !== undefined ? { autoAssign } : {}),
      ...(displayMode !== undefined ? { displayMode } : {}),
    },
    include: {
      department: { select: { id: true, name: true } },
      intakeSubDepartment: { select: { id: true, name: true } },
    },
  })
  return NextResponse.json(form, { status: 201 })
}
