import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import { requireAdminOrManager, managerDeptScope } from "@/lib/auth"
import { sanitizeFormBranding } from "@/lib/form-branding"

async function assertFormScope(
  formId: string,
  deptScope: Set<string> | null,
): Promise<{ form: { id: string; departmentId: string; intakeSubDepartmentId: string } } | NextResponse> {
  const form = await prisma.intakeFormConfig.findUnique({
    where: { id: formId },
    select: { id: true, departmentId: true, intakeSubDepartmentId: true },
  })
  if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 })
  if (deptScope && !deptScope.has(form.departmentId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  return { form }
}

function isNextResponse(v: unknown): v is NextResponse {
  return v instanceof NextResponse
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error

  const { id } = await params
  const result = await assertFormScope(id, managerDeptScope(profile!))
  if (isNextResponse(result)) return result

  const body = await request.json()
  const name = (body.name as string | undefined)?.trim()
  const intakeSubDepartmentId = (body.intakeSubDepartmentId as string | undefined)?.trim()
  const isActive = typeof body.isActive === "boolean" ? body.isActive : undefined
  const autoAssign = typeof body.autoAssign === "boolean" ? body.autoAssign : undefined
  const workloadThreshold =
    typeof body.workloadThreshold === "number" ? body.workloadThreshold : undefined
  const displayMode =
    body.displayMode === "FORM" || body.displayMode === "CHAT" ? body.displayMode : undefined
  // `branding: null` (or an all-invalid object) clears the override; a valid
  // object replaces it. Omitting the key leaves branding untouched.
  const brandingProvided = "branding" in body
  const branding = brandingProvided ? sanitizeFormBranding(body.branding) : undefined

  if (name !== undefined && !name) {
    return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 })
  }

  if (intakeSubDepartmentId !== undefined) {
    const subDepartment = await prisma.subDepartment.findUnique({
      where: { id: intakeSubDepartmentId },
      select: { departmentId: true },
    })
    if (!subDepartment) return NextResponse.json({ error: "Intake team not found" }, { status: 404 })
    if (subDepartment.departmentId !== result.form.departmentId) {
      return NextResponse.json(
        { error: "Intake team must belong to the form's department" },
        { status: 400 },
      )
    }
  }

  const targetSubDepartmentId = intakeSubDepartmentId ?? result.form.intakeSubDepartmentId
  if (workloadThreshold !== undefined) {
    await prisma.subDepartment.update({
      where: { id: targetSubDepartmentId },
      data: { workloadThreshold },
    })
  }

  const form = await prisma.intakeFormConfig.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(intakeSubDepartmentId !== undefined ? { intakeSubDepartmentId } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(autoAssign !== undefined ? { autoAssign } : {}),
      ...(displayMode !== undefined ? { displayMode } : {}),
      ...(brandingProvided
        ? { branding: (branding ?? Prisma.JsonNull) as Prisma.InputJsonValue }
        : {}),
    },
    include: {
      department: { select: { id: true, name: true } },
      intakeSubDepartment: { select: { id: true, name: true, workloadThreshold: true } },
    },
  })
  return NextResponse.json(form)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error

  const { id } = await params
  const result = await assertFormScope(id, managerDeptScope(profile!))
  if (isNextResponse(result)) return result

  // A form with submissions can't be deleted — its intakes reference it and are
  // kept for record/audit. Block with a clear error instead of a FK crash.
  const submissionCount = await prisma.intake.count({ where: { formConfigId: id } })
  if (submissionCount > 0) {
    return NextResponse.json(
      {
        error: `This form has ${submissionCount} submission${submissionCount === 1 ? "" : "s"} and can't be deleted. Deactivate it instead.`,
      },
      { status: 409 },
    )
  }

  await prisma.intakeFormConfig.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
