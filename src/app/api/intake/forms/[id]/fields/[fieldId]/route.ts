import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAdminOrManager, managerDeptScope } from "@/lib/auth"
import { IntakeFieldType } from "@/generated/prisma/client"

const VALID_TYPES = new Set<string>(Object.values(IntakeFieldType))

async function assertFieldAccess(
  fieldId: string,
  deptScope: Set<string> | null,
): Promise<{ field: { id: string; formConfigId: string; type: IntakeFieldType } } | NextResponse> {
  const field = await prisma.intakeFormField.findUnique({
    where: { id: fieldId },
    select: { id: true, formConfigId: true, type: true, formConfig: { select: { departmentId: true } } },
  })
  if (!field) return NextResponse.json({ error: "Field not found" }, { status: 404 })
  if (deptScope && !deptScope.has(field.formConfig.departmentId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  return { field }
}

function isNextResponse(v: unknown): v is NextResponse {
  return v instanceof NextResponse
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; fieldId: string }> },
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error

  const { fieldId } = await params
  const access = await assertFieldAccess(fieldId, managerDeptScope(profile!))
  if (isNextResponse(access)) return access

  const body = await request.json()
  const label = (body.label as string | undefined)?.trim()
  const type = body.type as string | undefined
  const isRequired = typeof body.isRequired === "boolean" ? body.isRequired : undefined
  const options: string[] | undefined = Array.isArray(body.options)
    ? body.options.filter((o: unknown) => typeof o === "string")
    : undefined
  const childOptions: Record<string, string[]> | undefined =
    body.childOptions && typeof body.childOptions === "object" && !Array.isArray(body.childOptions)
      ? body.childOptions
      : undefined
  const order = typeof body.order === "number" ? body.order : undefined
  const placeholder = "placeholder" in body
    ? (typeof body.placeholder === "string" ? body.placeholder.trim() || null : null)
    : undefined
  const helperText = "helperText" in body
    ? (typeof body.helperText === "string" ? body.helperText.trim() || null : null)
    : undefined
  const validation = "validation" in body
    ? (body.validation && typeof body.validation === "object" && !Array.isArray(body.validation) ? body.validation : null)
    : undefined

  if (label !== undefined && !label) {
    return NextResponse.json({ error: "label cannot be empty" }, { status: 400 })
  }
  if (type !== undefined && !VALID_TYPES.has(type)) {
    return NextResponse.json({ error: `type must be one of: ${[...VALID_TYPES].join(", ")}` }, { status: 400 })
  }

  const resolvedType = (type ?? access.field.type) as IntakeFieldType
  const field = await prisma.intakeFormField.update({
    where: { id: fieldId },
    data: {
      ...(label !== undefined ? { label } : {}),
      ...(type !== undefined ? { type: resolvedType } : {}),
      ...(isRequired !== undefined ? { isRequired } : {}),
      ...(options !== undefined ? { options: resolvedType === "select" ? options : [] } : {}),
      ...(childOptions !== undefined ? { childOptions: resolvedType === "select" ? childOptions : {} } : {}),
      ...(order !== undefined ? { order } : {}),
      ...(placeholder !== undefined ? { placeholder } : {}),
      ...(helperText !== undefined ? { helperText } : {}),
      ...(validation !== undefined ? { validation } : {}),
    },
  })
  return NextResponse.json(field)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; fieldId: string }> },
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error

  const { fieldId } = await params
  const access = await assertFieldAccess(fieldId, managerDeptScope(profile!))
  if (isNextResponse(access)) return access

  await prisma.intakeFormField.delete({ where: { id: fieldId } })
  return new NextResponse(null, { status: 204 })
}
