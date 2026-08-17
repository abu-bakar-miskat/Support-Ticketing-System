import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { parseStartDatePayload, parseDueDatePayload } from "@/lib/ticket-datetime"
import { requireAuth } from "@/app/api/admin/_guard"
import { assertTicketEditAccess } from "@/lib/auth"
import { sendAssignmentEmail } from "@/lib/email"
import { createNotification } from "@/lib/notify"
import { appendTicketEvent } from "@/lib/ticket-events"
import { projectInScope, teamInScope, getProfileDeptScope } from "@/lib/dept-scope"
import { teamTenantId } from "@/lib/tenant-scope"
import { resolveTeamIdForProject, resolveBoardTeamForProjectTicket, isProjectMember } from "@/lib/cross-access"
import { resolveMiscProjectForTeam } from "@/lib/misc-project"
import { canModifyProjectContent, PROJECT_MODIFY_FORBIDDEN_MESSAGE } from "@/lib/project-permissions"
import { ensureProjectMembers } from "@/lib/ensure-project-members"
import { resolveColumnIdForStatus } from "@/lib/board-columns"

const VALID_TYPES = ["Bug", "Feature", "Task", "Chore"] as const
const VALID_PRIORITIES = ["Low", "Medium", "High", "Critical", "Urgent"] as const

type TicketType = (typeof VALID_TYPES)[number]
type TicketPriority = (typeof VALID_PRIORITIES)[number]

export async function GET(request: Request) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get("projectId")

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 })
  }

  if (!(await projectInScope(profile, projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const tickets = await prisma.ticket.findMany({
    where: { projectId, deletedAt: null, isDraft: false },
    orderBy: [{ status: "asc" }, { ticketNumber: "asc" }],
    select: {
      id: true,
      title: true,
      ticketNumber: true,
      status: true,
      priority: true,
      sprintId: true,
      parentId: true,
      assignee: { select: { name: true, avatarUrl: true } },
      team: { select: { prefix: true } },
    },
  })

  return NextResponse.json(tickets)
}

export async function POST(request: Request) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const body = await request.json()
  const isDraft = body.isDraft === true
  const title = (body.title as string)?.trim()
  const type = (body.type as string) || "Task"
  const priority = (body.priority as string) || (isDraft ? "Low" : "")
  const status = (body.status as string)?.trim() || "To Do"
  const projectId = (body.projectId as string | null) || null
  const assigneeId = body.unassigned === true
    ? null
    : ((body.assigneeId as string | undefined) || profile.id)
  const now = new Date()
  const startDate = body.startDate
    ? parseStartDatePayload(body.startDate as string)
    : now
  const dueDate = (() => {
    if (body.dueDate) return parseDueDatePayload(body.dueDate as string)
    const eod = new Date(now)
    eod.setHours(23, 59, 59, 999)
    return eod
  })()
  const parentId = (body.parentId as string | undefined) || null
  const description = (body.description as string)?.trim() || null
  const storyPoints = body.storyPoints != null ? parseInt(String(body.storyPoints), 10) : null
  const estimatedTime = body.estimatedTime != null ? parseInt(String(body.estimatedTime), 10) : null
  const sprintId = (body.sprintId as string | null) || null
  const moduleId = (body.moduleId as string | null) || null
  const labels = Array.isArray(body.labels)
    ? [...new Set((body.labels as unknown[]).filter((l) => typeof l === "string").map((l) => (l as string).trim()).filter(Boolean))]
    : []
  const assetLinks = Array.isArray(body.assetLinks)
    ? (body.assetLinks as { label?: string; url?: string }[])
        .filter((a) => typeof a?.url === "string" && a.url.trim())
        .map((a) => ({ label: (a.label ?? "").trim(), url: a.url!.trim() }))
    : []
  const templateData = typeof body.templateData === "object" && body.templateData ? body.templateData : null
  const templateId = typeof body.templateId === "string" && body.templateId.trim() ? body.templateId.trim() : null
  // Allow admin/manager to specify which team's board this ticket belongs to
  const bodyTeamId = (body.teamId as string | undefined) || null

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 })
  }

  if (!isDraft && !priority) {
    return NextResponse.json(
      { error: "title and priority are required" },
      { status: 400 }
    )
  }

  if (!VALID_TYPES.includes(type as TicketType)) {
    return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(", ")}` }, { status: 400 })
  }

  if (!VALID_PRIORITIES.includes(priority as TicketPriority)) {
    return NextResponse.json(
      { error: `priority must be one of: ${VALID_PRIORITIES.join(", ")}` },
      { status: 400 }
    )
  }

  // Admin/manager/cross-dept-access users can create tickets on behalf of any team
  const hasGrantedAccess =
    (profile.grantedAccessDeptIds ?? []).length > 0 ||
    (profile.directMemberDeptIds ?? []).length > 0
  const canPickTeam = profile.role === "admin" || profile.role === "manager" || hasGrantedAccess
  const deptScope = await getProfileDeptScope(profile)

  // Cross-access-only visitors must create tickets against a project they're explicitly
  // assigned to — no falling back to a team-wide auto-created "Miscellaneous" project.
  if (deptScope?.isCrossAccessOnly && !projectId) {
    return NextResponse.json(
      { error: "Select a project you're assigned to in this department" },
      { status: 400 }
    )
  }

  let resolvedTeamId: string | null = null

  let projectForTeam: {
    teamId: string | null
    departmentId: string | null
    team: { departmentId: string | null } | null
  } | null = null

  if (projectId) {
    projectForTeam = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        teamId: true,
        departmentId: true,
        team: { select: { departmentId: true } },
      },
    })
    if (!projectForTeam) {
      return NextResponse.json({ error: "Project not found" }, { status: 400 })
    }
  }

  // Honor the board tab the user created from (any role with project access).
  if (bodyTeamId && projectForTeam && projectId) {
    resolvedTeamId = await resolveBoardTeamForProjectTicket(
      projectForTeam,
      projectId,
      bodyTeamId,
    )
  }

  // Admin/manager/cross-dept users may also pick any valid team when not on a project board.
  if (!resolvedTeamId && canPickTeam && bodyTeamId) {
    const bodyTeam = await prisma.team.findUnique({
      where: { id: bodyTeamId },
      select: { id: true },
    })
    if (bodyTeam) resolvedTeamId = bodyTeamId
  }

  // Any user may create on the team board they're currently viewing when that
  // team is within their department scope — even if it isn't their primary
  // `profile.teamId` (e.g. reached via department/multi-team membership). The
  // teamAllowed check below re-verifies scope, so this doesn't widen access.
  if (!resolvedTeamId && bodyTeamId && (await teamInScope(profile, bodyTeamId))) {
    resolvedTeamId = bodyTeamId
  }

  if (!resolvedTeamId && projectForTeam) {
    resolvedTeamId = await resolveTeamIdForProject(
      projectForTeam,
      projectId ?? undefined,
    )
  }

  if (!resolvedTeamId && canPickTeam && deptScope?.teamIds?.length) {
    // deptScope.teamIds already come from the DB — no need to re-verify each one
    resolvedTeamId = deptScope.teamIds[0]
  }

  // Cross-access guests must not fall back to their home team in another department.
  if (!resolvedTeamId && !deptScope?.isCrossAccessOnly) {
    resolvedTeamId = profile.teamId
  }

  if (!resolvedTeamId) {
    return NextResponse.json(
      {
        error: projectId
          ? "No valid team found for this project — contact a department admin"
          : "You must be assigned to a team before creating tickets",
      },
      { status: 422 },
    )
  }

  const teamRecord = await prisma.team.findUnique({
    where: { id: resolvedTeamId },
    select: { id: true },
  })
  if (!teamRecord) {
    return NextResponse.json(
      { error: "No valid team found for this project — contact a department admin" },
      { status: 422 },
    )
  }

  const teamAllowed =
    (await teamInScope(profile, resolvedTeamId)) ||
    (projectId != null && (await projectInScope(profile, projectId)))

  if (!teamAllowed) {
    return NextResponse.json({ error: "Team not in current department" }, { status: 403 })
  }

  if (parentId) {
    const parent = await prisma.ticket.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        teamId: true,
        projectId: true,
        assigneeId: true,
        tenantId: true,
        creatorId: true,
        deletedAt: true,
        team: { select: { departmentId: true } },
        assignees: { select: { userId: true } },
      },
    })
    if (!parent || parent.deletedAt) {
      return NextResponse.json({ error: "Parent ticket not found" }, { status: 400 })
    }
    const parentEditError = await assertTicketEditAccess(profile, parent)
    if (parentEditError) return parentEditError
  }

  // Validate referenced rows before insert — clearer errors than FK violations
  const assigneeProfile = assigneeId
    ? await prisma.profile.findUnique({ where: { id: assigneeId }, select: { id: true } })
    : null
  if (assigneeId && !assigneeProfile) {
    return NextResponse.json({ error: "Assignee not found" }, { status: 400 })
  }

  // Resolve the project — if none selected, find or create a "Miscellaneous" project for this team
  let resolvedProjectId: string
  if (projectId) {
    if (!(await projectInScope(profile, projectId))) {
      return NextResponse.json({ error: "Project not in current department" }, { status: 403 })
    }
    const isMember = profile.id
      ? await isProjectMember(profile.id, projectId)
      : false
    if (!canModifyProjectContent(profile, isMember)) {
      return NextResponse.json({ error: PROJECT_MODIFY_FORBIDDEN_MESSAGE }, { status: 403 })
    }
    const target = await prisma.project.findUnique({
      where: { id: projectId },
      select: { kind: true },
    })
    if (target?.kind === "support") {
      return NextResponse.json(
        { error: "Support projects only accept tickets from the support form" },
        { status: 403 },
      )
    }
    resolvedProjectId = projectId
  } else {
    resolvedProjectId = await resolveMiscProjectForTeam(resolvedTeamId)
  }

  // Module must belong to the resolved project and the project must have modules enabled
  if (moduleId) {
    const moduleRow = await prisma.projectModule.findUnique({
      where: { id: moduleId },
      select: { projectId: true, project: { select: { moduleSystemEnabled: true } } },
    })
    if (
      !moduleRow ||
      moduleRow.projectId !== resolvedProjectId ||
      !moduleRow.project.moduleSystemEnabled
    ) {
      return NextResponse.json(
        { error: "Module does not belong to this project" },
        { status: 400 },
      )
    }
  }

  // Only link the template if it still exists — a stale id shouldn't block ticket creation
  const validTemplateId = templateId
    ? (await prisma.ticketTemplate.findUnique({ where: { id: templateId }, select: { id: true } }))?.id ?? null
    : null

  // A ticket lives in its team's tenant — the outermost isolation boundary.
  const ticketTenantId = await teamTenantId(resolvedTeamId)
  if (!ticketTenantId) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 })
  }

  // Place the ticket in a column of its own department's board (DAT-03). The
  // department is the project's (or its team's); null column is tolerated when
  // the board isn't seeded yet (pre-backfill).
  const columnProject = await prisma.project.findUnique({
    where: { id: resolvedProjectId },
    select: { departmentId: true, team: { select: { departmentId: true } } },
  })
  const columnDeptId = columnProject?.departmentId ?? columnProject?.team?.departmentId ?? null
  const boardColumnId = columnDeptId
    ? await resolveColumnIdForStatus(prisma, { departmentId: columnDeptId, status })
    : null

  // ticketNumber: 0 is a placeholder — the BEFORE INSERT trigger stamps the real per-team value
  let ticket
  try {
    ticket = await prisma.ticket.create({
      data: {
        title,
        description,
        type: type as TicketType,
        priority: priority as TicketPriority,
        status,
        isDraft,
        ticketNumber: 0,
        startDate,
        dueDate,
        creator: { connect: { id: profile.id } },
        tenant: { connect: { id: ticketTenantId } },
        team: { connect: { id: resolvedTeamId } },
        project: { connect: { id: resolvedProjectId } },
        ...(assigneeId ? { assignee: { connect: { id: assigneeId } } } : {}),
        ...(parentId ? { parent: { connect: { id: parentId } } } : {}),
        ...(storyPoints != null && !isNaN(storyPoints) ? { storyPoints } : {}),
        ...(estimatedTime != null && !isNaN(estimatedTime) ? { estimatedTime } : {}),
        ...(sprintId ? { sprint: { connect: { id: sprintId } } } : {}),
        ...(moduleId ? { module: { connect: { id: moduleId } } } : {}),
        ...(labels.length > 0 ? { labels } : {}),
        ...(assetLinks.length > 0 ? { assetLinks } : {}),
        ...(templateData ? { templateData } : {}),
        ...(validTemplateId ? { template: { connect: { id: validTemplateId } } } : {}),
        ...(boardColumnId ? { boardColumn: { connect: { id: boardColumnId } } } : {}),
      },
      include: {
        team: { select: { id: true, name: true, prefix: true, departmentId: true } },
        assignee: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
      },
    })
  } catch (err) {
    console.error("[POST /api/tickets] prisma.ticket.create failed:", err)
    return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 })
  }

  const humanId = `${ticket.team.prefix}-${ticket.ticketNumber}`

  await appendTicketEvent(ticket.id, profile.id, "TICKET_CREATED", {
    humanId,
    title,
    status,
  })

  // Primary assignee (and later co/QA via their own routes) join the project automatically.
  await ensureProjectMembers(resolvedProjectId, [assigneeId])

  // Record the sub-ticket on its parent's timeline so it shows up in the
  // parent's activity feed and pushes a live update to everyone viewing it.
  if (parentId && !isDraft) {
    void appendTicketEvent(parentId, profile.id, "SUBTICKET_ADDED", {
      humanId,
      title,
      subTicketId: ticket.id,
    }).catch(() => undefined)
  }

  // Drafts may have assignees selected, but never notify until published.
  if (!isDraft && ticket.assignee) {
    await createNotification({
      recipientId: ticket.assignee.id,
      actorId: profile.id,
      type: "assignment",
      ticketId: ticket.id,
      message: title,
    })
    if (ticket.assignee.id !== profile.id) {
      sendAssignmentEmail({
        to: ticket.assignee.email,
        assigneeName: ticket.assignee.name,
        assigneeId: ticket.assignee.id,
        ticketId: ticket.id,
        humanId,
        ticketTitle: title,
        assignedByName: profile.name,
        assignedById: profile.id,
        departmentId: ticket.team.departmentId,
      }).catch((err) => console.error("[assignment email] failed:", err))
    }
  }

  return NextResponse.json(ticket, { status: 201 })
}
