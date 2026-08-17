import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAdminOrManager, managerDeptScope } from "@/lib/auth"
import { assertUsersEligibleForProjectDepartment } from "@/lib/project-department-people"
import { parseAssigneeIds } from "../route"
import { TicketPriority } from "@/generated/prisma/client"

const VALID_PRIORITIES = new Set<string>(Object.values(TicketPriority))

async function assertIssueAccess(
  issueId: string,
  deptScope: Set<string> | null,
): Promise<
  { issue: { id: string; formConfigId: string }; departmentId: string } | NextResponse
> {
  const issue = await prisma.intakeIssue.findUnique({
    where: { id: issueId },
    select: { id: true, formConfigId: true, formConfig: { select: { departmentId: true } } },
  })
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 })
  if (deptScope && !deptScope.has(issue.formConfig.departmentId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  return { issue, departmentId: issue.formConfig.departmentId }
}

function isNextResponse(v: unknown): v is NextResponse {
  return v instanceof NextResponse
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; issueId: string }> },
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error

  const { issueId } = await params
  const access = await assertIssueAccess(issueId, managerDeptScope(profile!))
  if (isNextResponse(access)) return access

  const body = await request.json()
  const name = (body.name as string | undefined)?.trim()
  const priority = body.priority as string | undefined
  const estimatedHours =
    "estimatedHours" in body
      ? (typeof body.estimatedHours === "number" ? body.estimatedHours : null)
      : undefined
  // Only touch assignees when the field is present in the request.
  const assigneeIds = "assigneeIds" in body ? parseAssigneeIds(body.assigneeIds) : undefined

  if (name !== undefined && !name) {
    return NextResponse.json({ error: "name cannot be empty" }, { status: 400 })
  }
  if (priority !== undefined && !VALID_PRIORITIES.has(priority)) {
    return NextResponse.json(
      { error: `priority must be one of: ${[...VALID_PRIORITIES].join(", ")}` },
      { status: 400 },
    )
  }

  if (assigneeIds !== undefined) {
    const eligibility = await assertUsersEligibleForProjectDepartment(access.departmentId, assigneeIds)
    if (!eligibility.ok) {
      return NextResponse.json(
        { error: "Assignees must belong to the form's department" },
        { status: 400 },
      )
    }
  }

  const issue = await prisma.intakeIssue.update({
    where: { id: issueId },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(priority !== undefined ? { priority: priority as TicketPriority } : {}),
      ...(estimatedHours !== undefined ? { estimatedHours } : {}),
      // Replace the assignee set and reset the round-robin cursor so rotation
      // restarts cleanly whenever the set changes.
      ...(assigneeIds !== undefined
        ? {
            assignees: { deleteMany: {}, create: assigneeIds.map((userId) => ({ userId })) },
            assigneeRotaPointer: 0,
          }
        : {}),
    },
    include: { assignees: { select: { userId: true } } },
  })
  return NextResponse.json({
    ...issue,
    assignees: undefined,
    assigneeIds: issue.assignees.map((a) => a.userId),
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; issueId: string }> },
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error

  const { issueId } = await params
  const access = await assertIssueAccess(issueId, managerDeptScope(profile!))
  if (isNextResponse(access)) return access

  await prisma.intakeIssue.delete({ where: { id: issueId } })
  return new NextResponse(null, { status: 204 })
}
