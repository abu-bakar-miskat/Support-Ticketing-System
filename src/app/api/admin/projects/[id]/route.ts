import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "../../_guard"
import { projectInScope, getProfileDeptScope } from "@/lib/dept-scope"
import { canAccessProjectSettings, canDeleteProjects, canManageProjectLifecycle, PROJECT_MODIFY_FORBIDDEN_MESSAGE } from "@/lib/project-permissions"
import { assertUsersEligibleForProjectDepartment } from "@/lib/project-department-people"
import { sanitizeLifecycleStages } from "@/lib/project-lifecycle"
import { broadcastProjectChange } from "@/lib/project-broadcast"

function optionalTrimmedString(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed || null
}

function optionalDate(value: unknown): Date | null {
  if (value == null) return null
  if (typeof value !== "string" || !value.trim()) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const body = await request.json()

  const project = await prisma.project.findUnique({
    where: { id },
    include: { subDepartment: { select: { departmentId: true } } },
  })
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (!(await projectInScope(profile, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const projectDeptId = project.departmentId ?? project.subDepartment?.departmentId ?? null
  const deptScope = await getProfileDeptScope(profile)
  const isProjectMember =
    (await prisma.projectMember.count({
      where: { projectId: id, userId: profile.id },
    })) > 0

  if (
    !canAccessProjectSettings(profile, {
      projectDeptId,
      activeDeptId: deptScope?.activeDeptId ?? null,
      isProjectMember,
    })
  ) {
    return NextResponse.json({ error: PROJECT_MODIFY_FORBIDDEN_MESSAGE }, { status: 403 })
  }

  const memberIds: string[] | undefined = Array.isArray(body.memberIds) ? body.memberIds : undefined

  if (memberIds !== undefined) {
    // Only validate NEWLY ADDED members — existing members are grandfathered so that
    // unrelated edits (name, status, module toggle, …) never fail on legacy membership.
    const existingMembers = await prisma.projectMember.findMany({
      where: { projectId: id },
      select: { userId: true },
    })
    const existingIds = new Set(existingMembers.map((m) => m.userId))
    const addedIds = memberIds.filter((uid) => !existingIds.has(uid))

    if (addedIds.length > 0) {
      const projectDeptId = project.departmentId ?? project.subDepartment?.departmentId ?? null
      const eligibility = await assertUsersEligibleForProjectDepartment(
        projectDeptId,
        addedIds,
      )
      if (!eligibility.ok) {
        return NextResponse.json(
          { error: "One or more members are outside this project's department" },
          { status: 400 },
        )
      }
    }
  }

  const statusOrLifecycleChanged =
    body.projectStatus !== undefined || body.lifecycleStages !== undefined

  if (statusOrLifecycleChanged && !canManageProjectLifecycle(profile)) {
    return NextResponse.json(
      { error: "Only managers and admins can change project status or lifecycle stages" },
      { status: 403 },
    )
  }

  const [updated] = await prisma.$transaction([
    prisma.project.update({
      where: { id },
      data: {
        ...(body.name ? { name: (body.name as string).trim() } : {}),
        ...(body.color ? { color: body.color as string } : {}),
        ...(body.description !== undefined ? { description: body.description as string | null } : {}),
        ...(body.departmentId !== undefined ? { departmentId: body.departmentId as string | null } : {}),
        ...(body.projectStatus !== undefined ? { projectStatus: body.projectStatus as string | null } : {}),
        ...(body.pipelineStartedAt !== undefined ? { pipelineStartedAt: optionalDate(body.pipelineStartedAt) } : {}),
        ...(body.developmentStartedAt !== undefined ? { developmentStartedAt: optionalDate(body.developmentStartedAt) } : {}),
        ...(body.liveAt !== undefined ? { liveAt: optionalDate(body.liveAt) } : {}),
        ...(body.lifecycleStages !== undefined ? { lifecycleStages: sanitizeLifecycleStages(body.lifecycleStages) ?? [] } : {}),
        ...(body.moduleSystemEnabled !== undefined ? { moduleSystemEnabled: body.moduleSystemEnabled === true } : {}),
        ...(body.githubRepo !== undefined ? { githubRepo: optionalTrimmedString(body.githubRepo) } : {}),
        ...(body.projectUrl !== undefined ? { projectUrl: optionalTrimmedString(body.projectUrl) } : {}),
        ...(body.analyticalLinks !== undefined ? { analyticalLinks: body.analyticalLinks } : {}),
        ...(body.guidelines !== undefined ? { guidelines: (body.guidelines as string) || null } : {}),
        ...(body.assets !== undefined ? { assets: body.assets } : {}),
      },
    }),
    ...(memberIds !== undefined
      ? [
          prisma.projectMember.deleteMany({ where: { projectId: id } }),
          ...(memberIds.length > 0
            ? [prisma.projectMember.createMany({
                data: memberIds.map((userId) => ({ projectId: id, userId })),
                skipDuplicates: true,
              })]
            : []),
        ]
      : []),
  ])

  if (statusOrLifecycleChanged) {
    void broadcastProjectChange(id)
  }

  return NextResponse.json(updated)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { profile, error } = await requireAuth()
  if (error) return error
  if (!canDeleteProjects(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id },
    include: { subDepartment: { select: { departmentId: true } } },
  })
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (!(await projectInScope(profile, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Cascade-delete all related ticket data, then the project.
  // Order matters: delete child rows before their parent rows to avoid FK violations.
  const tickets = await prisma.ticket.findMany({ where: { projectId: id }, select: { id: true } })
  const ticketIds = tickets.map((t) => t.id)

  await prisma.$transaction([
    // 1. Mentions reference Comment (non-nullable FK) — must go first
    ...(ticketIds.length > 0 ? [
      prisma.mention.deleteMany({ where: { comment: { ticketId: { in: ticketIds } } } }),
      // 2. Notifications, attachments, activity reference Ticket
      prisma.notification.deleteMany({ where: { ticketId: { in: ticketIds } } }),
      prisma.attachment.deleteMany({ where: { ticketId: { in: ticketIds } } }),
      // 3. Now safe to delete comments
      prisma.comment.deleteMany({ where: { ticketId: { in: ticketIds } } }),
      prisma.activityLog.deleteMany({ where: { ticketId: { in: ticketIds } } }),
      prisma.timeEntry.deleteMany({ where: { ticketId: { in: ticketIds } } }),
      (prisma.ticketAssignee as any).deleteMany({ where: { ticketId: { in: ticketIds } } }),
      // 4. Null-out parentId on sub-tickets that live outside this project
      prisma.ticket.updateMany({ where: { parentId: { in: ticketIds } }, data: { parentId: null } }),
      // 5. Unlink intakes so their ticketId FK doesn't block ticket deletion
      prisma.intake.updateMany({ where: { ticketId: { in: ticketIds } }, data: { ticketId: null } }),
    ] : []),
    // 6. Unlink sprints (projectId is optional, no cascade defined)
    prisma.sprint.updateMany({ where: { projectId: id }, data: { projectId: null } }),
    // 7. Delete tickets, then project (ProjectMember has onDelete:Cascade so auto-removed)
    ...(ticketIds.length > 0 ? [prisma.ticket.deleteMany({ where: { projectId: id } })] : []),
    prisma.project.delete({ where: { id } }),
  ])

  return new NextResponse(null, { status: 204 })
}
