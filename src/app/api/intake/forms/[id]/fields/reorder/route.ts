import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAdminOrManager, managerDeptScope } from "@/lib/auth"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error

  const { id: formId } = await params

  const form = await prisma.intakeFormConfig.findUnique({
    where: { id: formId },
    select: { departmentId: true },
  })
  if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 })

  const deptScope = managerDeptScope(profile!)
  if (deptScope && !deptScope.has(form.departmentId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const fieldIds: string[] = Array.isArray(body.fieldIds) ? body.fieldIds : []
  if (fieldIds.length === 0) {
    return NextResponse.json({ error: "fieldIds array is required" }, { status: 400 })
  }

  await prisma.$transaction(
    fieldIds.map((fieldId, index) =>
      prisma.intakeFormField.update({
        where: { id: fieldId },
        data: { order: index },
      }),
    ),
  )

  return new NextResponse(null, { status: 204 })
}
