import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAdminOrManager, managerDeptScope } from "@/lib/auth"
import type { Prisma } from "@/generated/prisma/client"
import {
  resolveIntakeDefaultFields,
  sanitizeIntakeDefaultFields,
} from "@/lib/intake-default-fields"

async function assertFormAccess(
  formId: string,
  deptScope: Set<string> | null,
): Promise<{ intakeDefaultFields: unknown } | NextResponse> {
  const form = await prisma.intakeFormConfig.findUnique({
    where: { id: formId },
    select: { departmentId: true, intakeDefaultFields: true },
  })
  if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 })
  if (deptScope && !deptScope.has(form.departmentId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  return { intakeDefaultFields: form.intakeDefaultFields }
}

function isNextResponse(v: unknown): v is NextResponse {
  return v instanceof NextResponse
}

// GET — resolved default-field labels/placeholders for this form
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error

  const { id: formId } = await params
  const access = await assertFormAccess(formId, managerDeptScope(profile!))
  if (isNextResponse(access)) return access

  return NextResponse.json(resolveIntakeDefaultFields(access.intakeDefaultFields))
}

// PATCH — save this form's default-field overrides (title + placeholder only).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error

  const { id: formId } = await params
  const access = await assertFormAccess(formId, managerDeptScope(profile!))
  if (isNextResponse(access)) return access

  const body = await request.json().catch(() => ({}))
  const sanitized = sanitizeIntakeDefaultFields(body)

  await prisma.intakeFormConfig.update({
    where: { id: formId },
    data: { intakeDefaultFields: sanitized as Prisma.InputJsonValue },
  })

  return NextResponse.json(resolveIntakeDefaultFields(sanitized))
}
