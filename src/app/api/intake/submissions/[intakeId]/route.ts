import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAdminOrManager, managerDeptScope } from "@/lib/auth"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ intakeId: string }> },
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error

  const { intakeId } = await params

  const intake = await prisma.intake.findUnique({
    where: { id: intakeId },
    select: { id: true, formConfig: { select: { departmentId: true } } },
  })
  if (!intake) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 })
  }

  const deptScope = managerDeptScope(profile!)
  if (deptScope && !deptScope.has(intake.formConfig.departmentId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.intake.delete({ where: { id: intakeId } })
  return new NextResponse(null, { status: 204 })
}
