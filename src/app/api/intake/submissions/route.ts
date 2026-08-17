import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAdminOrManager, managerDeptScope } from "@/lib/auth"

export async function DELETE(request: Request) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const ids = Array.isArray(body.ids)
    ? (body.ids as unknown[]).filter((v): v is string => typeof v === "string")
    : []

  if (ids.length === 0) {
    return NextResponse.json({ error: "No submission ids provided" }, { status: 400 })
  }

  const intakes = await prisma.intake.findMany({
    where: { id: { in: ids } },
    select: { id: true, formConfig: { select: { departmentId: true } } },
  })

  const deptScope = managerDeptScope(profile!)
  if (deptScope) {
    const outOfScope = intakes.some(
      (i) => !deptScope.has(i.formConfig.departmentId),
    )
    if (outOfScope) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const result = await prisma.intake.deleteMany({
    where: { id: { in: intakes.map((i) => i.id) } },
  })

  return NextResponse.json({ deleted: result.count })
}
