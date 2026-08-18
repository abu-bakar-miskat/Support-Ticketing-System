import { NextRequest, NextResponse, after } from "next/server"
import { prisma } from "@/lib/db"
import { requireAdminOrManager } from "@/lib/auth"
import { getProfileDeptScope } from "@/lib/dept-scope"
import { createBulkReassignJob, runBulkReassignJobAsSystem } from "@/lib/bulk-reassign"
import { assertFeatureEnabled } from "@/lib/feature-flags"

const TARGET_TYPES = ["SINGLE_AGENT", "GROUP", "DEPARTMENT_POOL"] as const
type TargetType = (typeof TARGET_TYPES)[number]

// ASG-05/C-05: bulk-reassign a source agent's tickets to a single agent, a
// group (Team), or the department pool (auto-routed per the department's
// configured assignment method). Snapshots the target tickets synchronously,
// then processes them off the request path via `after()` — see
// lib/bulk-reassign.ts for the idempotent-on-retry processing + the cron
// sweep that resumes a job if this `after()` call never completes.
export async function POST(req: NextRequest) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const body = await req.json().catch(() => ({}))
  const { departmentId, sourceAssigneeId, targetType, targetAgentId, targetTeamId } = body as {
    departmentId?: string
    sourceAssigneeId?: string
    targetType?: TargetType
    targetAgentId?: string
    targetTeamId?: string
  }

  if (!departmentId || !sourceAssigneeId) {
    return NextResponse.json({ error: "departmentId and sourceAssigneeId are required" }, { status: 400 })
  }
  if (!targetType || !TARGET_TYPES.includes(targetType)) {
    return NextResponse.json({ error: `targetType must be one of ${TARGET_TYPES.join(", ")}` }, { status: 400 })
  }
  if (targetType === "SINGLE_AGENT" && !targetAgentId) {
    return NextResponse.json({ error: "targetAgentId is required for SINGLE_AGENT" }, { status: 400 })
  }
  if (targetType === "GROUP" && !targetTeamId) {
    return NextResponse.json({ error: "targetTeamId is required for GROUP" }, { status: 400 })
  }

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, tenantId: true },
  })
  if (!department) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 })
  }

  // SA-04: a Super Admin can disable bulk-reassign per tenant.
  const featureCheck = await assertFeatureEnabled(department.tenantId, "bulkReassign")
  if (!featureCheck.ok) {
    return NextResponse.json({ error: featureCheck.error }, { status: 403 })
  }

  // Managers are restricted to their own department scope; admins are not.
  let scopeTeamIds: string[] | null = null
  if (caller!.role === "manager") {
    const deptScope = await getProfileDeptScope(caller!)
    if (!deptScope?.allowedDeptIds.includes(departmentId)) {
      return NextResponse.json({ error: "Department is outside your scope" }, { status: 403 })
    }
    scopeTeamIds = deptScope.teamIds
  }

  if (targetType === "SINGLE_AGENT") {
    const agent = await prisma.profile.findUnique({ where: { id: targetAgentId }, select: { id: true, deletedAt: true } })
    if (!agent || agent.deletedAt) {
      return NextResponse.json({ error: "targetAgentId not found" }, { status: 404 })
    }
  }
  if (targetType === "GROUP") {
    const team = await prisma.team.findUnique({ where: { id: targetTeamId }, select: { id: true, departmentId: true } })
    if (!team || team.departmentId !== departmentId) {
      return NextResponse.json({ error: "targetTeamId must belong to the given department" }, { status: 404 })
    }
  }

  const job = await createBulkReassignJob({
    tenantId: department.tenantId,
    departmentId,
    createdById: caller!.id,
    sourceAssigneeId,
    targetType,
    targetAgentId: targetAgentId ?? null,
    targetTeamId: targetTeamId ?? null,
    scopeTeamIds,
  })

  after(() => runBulkReassignJobAsSystem(job.id))

  return NextResponse.json({ jobId: job.id, status: job.status, ticketCount: job.ticketIds.length }, { status: 202 })
}
