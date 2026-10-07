import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import { requireAuth, departmentAdminScope } from "@/lib/auth"
import { sanitizeFormBranding } from "@/lib/form-branding"
import { AssignmentMethod } from "@/generated/prisma/enums"

const VALID_METHODS = new Set<string>(Object.values(AssignmentMethod))

/** Parses a per-form assignment-method override: null = inherit, a valid enum
 *  value = override, undefined = leave untouched (invalid values are ignored). */
function parseAssignmentMethod(value: unknown): AssignmentMethod | null | undefined {
  if (value === null) return null
  if (typeof value === "string" && VALID_METHODS.has(value)) return value as AssignmentMethod
  return undefined
}

async function assertFormScope(
  formId: string,
  deptScope: Set<string> | null,
): Promise<{ form: { id: string; departmentId: string; intakeSubDepartmentId: string | null } } | NextResponse> {
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
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const result = await assertFormScope(id, departmentAdminScope(profile!))
  if (isNextResponse(result)) return result

  const body = await request.json()
  const name = (body.name as string | undefined)?.trim()
  // Present with a value = set default sub-department; present as null/"" = clear
  // (department-level form, route by issue); absent = leave untouched.
  const subDeptProvided = "intakeSubDepartmentId" in body
  const intakeSubDepartmentId = subDeptProvided
    ? (body.intakeSubDepartmentId as string | null)?.trim() || null
    : undefined
  const isActive = typeof body.isActive === "boolean" ? body.isActive : undefined
  const autoAssign = typeof body.autoAssign === "boolean" ? body.autoAssign : undefined
  const assignmentMethod = parseAssignmentMethod(body.assignmentMethod)
  const displayMode =
    body.displayMode === "FORM" || body.displayMode === "CHAT" ? body.displayMode : undefined
  // `branding: null` (or an all-invalid object) clears the override; a valid
  // object replaces it. Omitting the key leaves branding untouched.
  const brandingProvided = "branding" in body
  const branding = brandingProvided ? sanitizeFormBranding(body.branding) : undefined

  if (name !== undefined && !name) {
    return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 })
  }

  if (intakeSubDepartmentId) {
    const subDepartment = await prisma.subDepartment.findUnique({
      where: { id: intakeSubDepartmentId },
      select: { departmentId: true },
    })
    if (!subDepartment) return NextResponse.json({ error: "Intake subDepartment not found" }, { status: 404 })
    if (subDepartment.departmentId !== result.form.departmentId) {
      return NextResponse.json(
        { error: "Intake subDepartment must belong to the form's department" },
        { status: 400 },
      )
    }
  }

  const form = await prisma.intakeFormConfig.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(subDeptProvided ? { intakeSubDepartmentId } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(autoAssign !== undefined ? { autoAssign } : {}),
      ...(assignmentMethod !== undefined ? { assignmentMethod } : {}),
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
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const result = await assertFormScope(id, departmentAdminScope(profile!))
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

  const portalKey = await prisma.apiKey.findUnique({
    where: { formConfigId: id },
    select: { id: true },
  })
  if (portalKey) {
    return NextResponse.json(
      { error: "This form is connected to a portal API key. Delete that connection before deleting the form." },
      { status: 409 },
    )
  }

  await prisma.intakeFormConfig.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
