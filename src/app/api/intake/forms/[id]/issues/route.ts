import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAdminOrManager, managerDeptScope } from "@/lib/auth"
import { assertUsersEligibleForProjectDepartment } from "@/lib/project-department-people"
import { TicketPriority } from "@/generated/prisma/client"

const VALID_PRIORITIES = new Set<string>(Object.values(TicketPriority))

/** Parse a body field into a deduped list of user-id strings. */
export function parseAssigneeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const ids = raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
  return [...new Set(ids.map((s) => s.trim()))]
}

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

  const issues = await prisma.intakeIssue.findMany({
    where: { formConfigId: formId },
    orderBy: { createdAt: "asc" },
    include: { assignees: { select: { userId: true } } },
  })
  return NextResponse.json(
    issues.map(({ assignees, ...issue }) => ({
      ...issue,
      assigneeIds: assignees.map((a) => a.userId),
    })),
  )
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
  const name = (body.name as string)?.trim()
  const priority = body.priority as string
  const estimatedHours = typeof body.estimatedHours === "number" ? body.estimatedHours : null
  const assigneeIds = parseAssigneeIds(body.assigneeIds)

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 })
  if (!priority || !VALID_PRIORITIES.has(priority)) {
    return NextResponse.json(
      { error: `priority must be one of: ${[...VALID_PRIORITIES].join(", ")}` },
      { status: 400 },
    )
  }

  // Assigned users must belong to the form's department (feature is dept-scoped).
  const eligibility = await assertUsersEligibleForProjectDepartment(access.departmentId, assigneeIds)
  if (!eligibility.ok) {
    return NextResponse.json(
      { error: "Assignees must belong to the form's department" },
      { status: 400 },
    )
  }

  const issue = await prisma.intakeIssue.create({
    data: {
      formConfigId: formId,
      name,
      priority: priority as TicketPriority,
      estimatedHours,
      assignees: { create: assigneeIds.map((userId) => ({ userId })) },
    },
    include: { assignees: { select: { userId: true } } },
  })
  return NextResponse.json(
    { ...issue, assignees: undefined, assigneeIds: issue.assignees.map((a) => a.userId) },
    { status: 201 },
  )
}
