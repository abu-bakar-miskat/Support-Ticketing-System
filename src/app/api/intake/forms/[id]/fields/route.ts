import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAdminOrManager, managerDeptScope } from "@/lib/auth"
import { IntakeFieldType } from "@/generated/prisma/client"

const VALID_TYPES = new Set<string>(Object.values(IntakeFieldType))

async function assertFormAccess(
  formId: string,
  deptScope: Set<string> | null,
): Promise<{ departmentId: string } | NextResponse> {
  const form = await prisma.intakeFormConfig.findUnique({
    where: { id: formId },
    select: { departmentId: true },
  })
  if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 })
  if (deptScope && !deptScope.has(form.departmentId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  return { departmentId: form.departmentId }
}

function isNextResponse(v: unknown): v is NextResponse {
  return v instanceof NextResponse
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error

  const { id: formId } = await params
  const access = await assertFormAccess(formId, managerDeptScope(profile!))
  if (isNextResponse(access)) return access

  const fields = await prisma.intakeFormField.findMany({
    where: { formConfigId: formId },
    orderBy: { order: "asc" },
  })
  return NextResponse.json(fields)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error

  const { id: formId } = await params
  const access = await assertFormAccess(formId, managerDeptScope(profile!))
  if (isNextResponse(access)) return access

  const body = await request.json()
  const label = (body.label as string)?.trim()
  const type = body.type as string
  const isRequired = typeof body.isRequired === "boolean" ? body.isRequired : false
  const options: string[] =
    Array.isArray(body.options) ? body.options.filter((o: unknown) => typeof o === "string") : []
  const childOptions: Record<string, string[]> =
    body.childOptions && typeof body.childOptions === "object" && !Array.isArray(body.childOptions)
      ? body.childOptions
      : {}
  const placeholder = typeof body.placeholder === "string" ? body.placeholder.trim() || null : null
  const helperText = typeof body.helperText === "string" ? body.helperText.trim() || null : null
  const validation = body.validation && typeof body.validation === "object" && !Array.isArray(body.validation)
    ? body.validation
    : null

  if (!label) return NextResponse.json({ error: "label is required" }, { status: 400 })
  if (!VALID_TYPES.has(type)) {
    return NextResponse.json({ error: `type must be one of: ${[...VALID_TYPES].join(", ")}` }, { status: 400 })
  }

  const maxOrder = await prisma.intakeFormField.aggregate({
    where: { formConfigId: formId },
    _max: { order: true },
  })
  const nextOrder = (maxOrder._max.order ?? -1) + 1

  const field = await prisma.intakeFormField.create({
    data: {
      formConfigId: formId,
      label,
      type: type as IntakeFieldType,
      isRequired,
      options: type === "select" ? options : [],
      childOptions: type === "select" ? childOptions : {},
      placeholder,
      helperText,
      validation,
      order: nextOrder,
    },
  })
  return NextResponse.json(field, { status: 201 })
}
