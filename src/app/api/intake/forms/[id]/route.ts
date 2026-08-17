import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import { requireAdminOrManager, managerDeptScope } from "@/lib/auth"
import { sanitizeFormBranding } from "@/lib/form-branding"

async function assertFormScope(
  formId: string,
  deptScope: Set<string> | null,
): Promise<{ form: { id: string; departmentId: string; intakeTeamId: string } } | NextResponse> {
  const form = await prisma.intakeFormConfig.findUnique({
    where: { id: formId },
    select: { id: true, departmentId: true, intakeTeamId: true },
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
  const intakeTeamId = (body.intakeTeamId as string | undefined)?.trim()
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

  if (intakeTeamId !== undefined) {
    const team = await prisma.team.findUnique({
      where: { id: intakeTeamId },
      select: { departmentId: true },
    })
    if (!team) return NextResponse.json({ error: "Intake team not found" }, { status: 404 })
    if (team.departmentId !== result.form.departmentId) {
      return NextResponse.json(
        { error: "Intake team must belong to the form's department" },
        { status: 400 },
      )
    }
  }

  const targetTeamId = intakeTeamId ?? result.form.intakeTeamId
  if (workloadThreshold !== undefined) {
    await prisma.team.update({
      where: { id: targetTeamId },
      data: { workloadThreshold },
    })
  }

  const form = await prisma.intakeFormConfig.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(intakeTeamId !== undefined ? { intakeTeamId } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(autoAssign !== undefined ? { autoAssign } : {}),
      ...(displayMode !== undefined ? { displayMode } : {}),
      ...(brandingProvided
        ? { branding: (branding ?? Prisma.JsonNull) as Prisma.InputJsonValue }
        : {}),
    },
    include: {
      department: { select: { id: true, name: true } },
      intakeTeam: { select: { id: true, name: true, workloadThreshold: true } },
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
