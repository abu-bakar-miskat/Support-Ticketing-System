import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { departmentIdInScope } from "@/lib/dept-scope"

/**
 * GET /api/departments/:id/forms — this department's intake forms, for the SLA
 * policy "support form" grouping. Minimal shape ({ id, name }); the caller then
 * loads a form's issues via /api/intake/forms/:formId/issues.
 *
 * When `?subDepartmentId=` is given, only forms routing to that sub-department
 * are returned — so the sub-department-scoped SLA surface shows just its own
 * forms, matching how that page scopes its policies.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  if (!(await departmentIdInScope(profile, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const rawSub = req.nextUrl.searchParams.get("subDepartmentId")
  const subDepartmentId = rawSub && rawSub.trim() ? rawSub.trim() : null

  const forms = await prisma.intakeFormConfig.findMany({
    where: {
      departmentId: id,
      ...(subDepartmentId ? { intakeSubDepartmentId: subDepartmentId } : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })

  return NextResponse.json(forms)
}
