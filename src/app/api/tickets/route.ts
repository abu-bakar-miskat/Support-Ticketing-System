import { prisma } from "@/lib/db"
import { NextResponse, after } from "next/server"
import { parseStartDatePayload, parseDueDatePayload } from "@/lib/ticket-datetime"
import { requireAuth } from "@/app/api/admin/_guard"
import { assertTicketEditAccess, type AuthProfile } from "@/lib/auth"
import { sendAssignmentEmail } from "@/lib/email"
import { createNotification } from "@/lib/notify"
import { appendTicketEvent } from "@/lib/ticket-events"
import { projectInScope, subDepartmentInScope, getProfileDeptScope } from "@/lib/dept-scope"
import { resolveProfileTicketScope } from "@/lib/prisma-scope"
import { getRequestScope, runWithScope } from "@/lib/request-scope"
import { buildProjectDepartmentPeopleWhere } from "@/lib/project-department-people"
import type { Prisma } from "@/generated/prisma/client"
import { resolveSubDepartmentIdForProject, resolveBoardSubDepartmentForProjectTicket, isProjectMember } from "@/lib/cross-access"
import { resolveMiscProjectForSubDepartment } from "@/lib/misc-project"
import { canModifyProjectContent, PROJECT_MODIFY_FORBIDDEN_MESSAGE } from "@/lib/project-permissions"
import { ensureProjectMembers } from "@/lib/ensure-project-members"
import { startSlaTimers } from "@/lib/sla-engine"
import { applyRulesToTicket } from "@/lib/rule-executor"
import { assertDepartmentOperational } from "@/lib/department-setup"

const VALID_TYPES = ["Bug", "Feature", "Task", "Chore"] as const
const VALID_PRIORITIES = ["Low", "Medium", "High", "Critical", "Urgent"] as const

type TicketType = (typeof VALID_TYPES)[number]
type TicketPriority = (typeof VALID_PRIORITIES)[number]

class AttachmentLinkConflict extends Error {}

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
      subDepartment: { select: { prefix: true } },
    },
  })

  return NextResponse.json(tickets)
}

export async function POST(request: Request) {
  const started = performance.now()
  const { profile, error } = await requireAuth()
  if (error) return error
  const authenticated = performance.now()
  const scope = await resolveProfileTicketScope(profile)
  const scoped = performance.now()
  const response = await runWithScope({
    tenantIds: scope.kind === "tenant" ? scope.tenantIds : [],
    isPlatformAdmin: scope.kind === "platform",
    ...(scope.kind === "tenant" ? {
      subDepartmentTeamIds: scope.subDepartmentTeamIds,
      grantedTicketIds: scope.grantedTicketIds,
    } : {}),
  }, () => createTicket(request, profile))
  response.headers.set("Server-Timing", `auth;dur=${(authenticated - started).toFixed(1)}, scope;dur=${(scoped - authenticated).toFixed(1)}, create;dur=${(performance.now() - scoped).toFixed(1)}`)
  return response
}

async function createTicket(request: Request, profile: AuthProfile) {
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
  for (const key of ["coAssigneeIds", "attachmentIds"] as const) {
    if (body[key] !== undefined && (!Array.isArray(body[key]) || body[key].some((id: unknown) => typeof id !== "string" || !id.trim()))) {
      return NextResponse.json({ error: `${key} must be an array of non-empty IDs` }, { status: 400 })
    }
  }
  const coAssigneeIds = [...new Set<string>(body.coAssigneeIds ?? [])].filter(id => id !== assigneeId)
  const attachmentIds = [...new Set<string>(body.attachmentIds ?? [])]
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
  // Allow admin/manager to specify which subDepartment's board this ticket belongs to
  const bodySubDepartmentId = (body.subDepartmentId as string | undefined) || null

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

  // Admin/manager/cross-dept-access users can create tickets on behalf of any subDepartment
  const hasGrantedAccess =
    (profile.grantedAccessDeptIds ?? []).length > 0 ||
    (profile.directMemberDeptIds ?? []).length > 0
  const canPickSubDepartment = profile.role === "admin" || profile.role === "manager" || hasGrantedAccess
  const deptScope = await getProfileDeptScope(profile)

  // Cross-access-only visitors must create tickets against a project they're explicitly
  // assigned to — no falling back to a team-wide auto-created "Miscellaneous" project.
  if (deptScope?.isCrossAccessOnly && !projectId) {
    return NextResponse.json(
      { error: "Select a project you're assigned to in this department" },
      { status: 400 }
    )
  }

  let resolvedSubDepartmentId: string | null = null

  let projectForSubDepartment: {
    kind: string
    subDepartmentId: string | null
    departmentId: string | null
    subDepartment: { departmentId: string | null } | null
  } | null = null

  if (projectId) {
    projectForSubDepartment = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        kind: true,
        subDepartmentId: true,
        departmentId: true,
        subDepartment: { select: { departmentId: true } },
      },
    })
    if (!projectForSubDepartment) {
      return NextResponse.json({ error: "Project not found" }, { status: 400 })
    }
  }

  // Honor the board tab the user created from (any role with project access).
  if (bodySubDepartmentId && projectForSubDepartment && projectId) {
    resolvedSubDepartmentId = await resolveBoardSubDepartmentForProjectTicket(
      projectForSubDepartment,
      projectId,
      bodySubDepartmentId,
    )
  }

  // Admin/manager/cross-dept users may also pick any valid subDepartment when not on a project board.
  if (!resolvedSubDepartmentId && canPickSubDepartment && bodySubDepartmentId) {
    const bodySubDepartment = await prisma.subDepartment.findUnique({
      where: { id: bodySubDepartmentId },
      select: { id: true },
    })
    if (bodySubDepartment) resolvedSubDepartmentId = bodySubDepartmentId
  }

  // Any user may create on the subDepartment board they're currently viewing when that
  // subDepartment is within their department scope — even if it isn't their primary
  // `profile.teamId` (e.g. reached via department/multi-team membership). The
  // subDepartmentAllowed check below re-verifies scope, so this doesn't widen access.
  if (!resolvedSubDepartmentId && bodySubDepartmentId && (await subDepartmentInScope(profile, bodySubDepartmentId))) {
    resolvedSubDepartmentId = bodySubDepartmentId
  }

  if (!resolvedSubDepartmentId && projectForSubDepartment) {
    resolvedSubDepartmentId = await resolveSubDepartmentIdForProject(
      projectForSubDepartment,
      projectId ?? undefined,
    )
  }

  if (!resolvedSubDepartmentId && canPickSubDepartment && deptScope?.subDepartmentIds?.length) {
    // deptScope.subDepartmentIds already come from the DB — no need to re-verify each one
    resolvedSubDepartmentId = deptScope.subDepartmentIds[0]
  }

  // Cross-access guests must not fall back to their home subDepartment in another department.
  if (!resolvedSubDepartmentId && !deptScope?.isCrossAccessOnly) {
    resolvedSubDepartmentId = profile.subDepartmentId
  }

  // A subDepartmentless platform super-admin has no home subDepartment to fall back on. Rather
  // than silently routing the ticket to an arbitrary subDepartment (previously the
  // alphabetically-first subDepartment's "Miscellaneous" project — impossible to
  // discover afterwards), require an explicit subDepartment/project pick so the super
  // admin always knows where the ticket lands.
  if (!resolvedSubDepartmentId && profile.isSuperAdmin) {
    return NextResponse.json(
      { error: "Select a subDepartment or project for this ticket" },
      { status: 422 },
    )
  }

  if (!resolvedSubDepartmentId) {
    return NextResponse.json(
      {
        error: projectId
          ? "No valid subDepartment found for this project — contact a department admin"
          : "You must be assigned to a subDepartment before creating tickets",
      },
      { status: 422 },
    )
  }

  const subDepartmentRecord = await prisma.subDepartment.findUnique({
    where: { id: resolvedSubDepartmentId },
    select: { id: true, departmentId: true, tenantId: true },
  })
  if (!subDepartmentRecord) {
    return NextResponse.json(
      { error: "No valid subDepartment found for this project — contact a department admin" },
      { status: 422 },
    )
  }

  const subDepartmentAllowed =
    profile.isSuperAdmin ||
    (await subDepartmentInScope(profile, resolvedSubDepartmentId)) ||
    (projectId != null && (await projectInScope(profile, projectId)))

  if (!subDepartmentAllowed) {
    return NextResponse.json({ error: "SubDepartment not in current department" }, { status: 403 })
  }

  // DS-08: a department blocks ticket creation until its initial setup review is complete.
  const setupCheck = await assertDepartmentOperational(subDepartmentRecord.departmentId)
  if (!setupCheck.ok) {
    return NextResponse.json({ error: setupCheck.error }, { status: 422 })
  }

  if (parentId) {
    const parent = await prisma.ticket.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        subDepartmentId: true,
        projectId: true,
        assigneeId: true,
        tenantId: true,
        creatorId: true,
        deletedAt: true,
        subDepartment: { select: { departmentId: true } },
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

  // Resolve the project — if none selected, find or create a "Miscellaneous" project for this subDepartment
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
    if (projectForSubDepartment?.kind === "support") {
      return NextResponse.json(
        { error: "Support projects only accept tickets from the support form" },
        { status: 403 },
      )
    }
    resolvedProjectId = projectId
  } else {
    resolvedProjectId = await resolveMiscProjectForSubDepartment(resolvedSubDepartmentId)
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

  // A ticket lives in its subDepartment's tenant — the outermost isolation boundary.
  const ticketTenantId = subDepartmentRecord.tenantId
  if (!ticketTenantId) {
    return NextResponse.json({ error: "SubDepartment not found" }, { status: 404 })
  }

  const coAssignees = coAssigneeIds.length > 0
    ? await prisma.profile.findMany({
        where: {
          ...buildProjectDepartmentPeopleWhere(subDepartmentRecord.departmentId),
          id: { in: coAssigneeIds },
        },
        select: { id: true, name: true, email: true },
      })
    : []
  if (coAssignees.length !== coAssigneeIds.length) {
    return NextResponse.json({ error: "Co-assignees must belong to the ticket's department" }, { status: 400 })
  }

  // ticketNumber: 0 is a placeholder — the BEFORE INSERT trigger stamps the real per-team value
  let ticket
  try {
    const persist = async (db: Prisma.TransactionClient | typeof prisma) => {
      const created = await db.ticket.create({
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
          subDepartment: { connect: { id: resolvedSubDepartmentId } },
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
          ...(coAssigneeIds.length > 0 ? {
            assignees: { createMany: { data: coAssigneeIds.map(userId => ({ userId })) } },
          } : {}),
        },
        include: {
          subDepartment: { select: { id: true, name: true, prefix: true, departmentId: true } },
          assignee: { select: { id: true, name: true, email: true } },
          project: { select: { id: true, name: true } },
        },
      })
      if (attachmentIds.length > 0) {
        // Conditional write prevents another request claiming the same uploads.
        // Throwing rolls back both the ticket and any attachments already linked.
        const linked = await db.attachment.updateMany({
          where: {
            id: { in: attachmentIds },
            uploaderProfileId: profile.id,
            status: "temporary",
            ticketId: null,
          },
          data: { ticketId: created.id, status: "attached" },
        })
        if (linked.count !== attachmentIds.length) throw new AttachmentLinkConflict()
      }
      if (coAssigneeIds.length > 0) {
        await ensureProjectMembers(resolvedProjectId, [assigneeId, ...coAssigneeIds], db)
      }
      return created
    }
    // Keep the simple case to one Prisma create; related saves commit atomically.
    ticket = attachmentIds.length > 0 || coAssigneeIds.length > 0
      ? await prisma.$transaction(tx => persist(tx))
      : await persist(prisma)
  } catch (err) {
    if (err instanceof AttachmentLinkConflict) {
      return NextResponse.json({ error: "One or more attachments cannot be linked to this ticket" }, { status: 403 })
    }
    console.error("[POST /api/tickets] prisma.ticket.create failed:", err)
    return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 })
  }

  const humanId = `${ticket.subDepartment.prefix}-${ticket.ticketNumber}`

  // The ticket is already committed above. Everything below is a side effect —
  // SLA timers, automation rules, the activity event, project-member sync, and
  // the assignment notification/email. On a single-connection pool these add
  // ~6-10 sequential DB round-trips; awaiting them here made "Create" feel slow
  // (the client blocks on the 201 for work it doesn't need in the response —
  // the returned `ticket` is the create() row and is never re-read after these).
  //
  // Run them via `after()` so the 201 returns immediately and the heavy work
  // happens post-response on this long-lived server. Each step stays isolated in
  // its own try/catch so one failure doesn't skip the rest, and — because the
  // response is already sent — none can turn into an unhandled 500 that returns
  // a non-JSON body the client can't parse (which would drive retries/dupes).
  const creationScope = getRequestScope()!
  after(() => runWithScope(creationScope, async () => {
    if (!isDraft) {
      // Resolve the ticket's department (the project's, or its subDepartment's)
      // to start SLA timers for the new ticket.
      const columnProject = await prisma.project
        .findUnique({
          where: { id: resolvedProjectId },
          select: { departmentId: true, subDepartment: { select: { departmentId: true } } },
        })
        .catch(() => null)
      const columnDeptId =
        columnProject?.departmentId ?? columnProject?.subDepartment?.departmentId ?? null

      if (columnDeptId) {
        try {
          await startSlaTimers(
            ticket.id,
            ticketTenantId,
            columnDeptId,
            { priority, type, title, description, labels },
            ticket.createdAt,
            ticket.subDepartment.id,
          )
        } catch (err) {
          console.error("[POST /api/tickets] startSlaTimers failed:", err)
        }
      }
    }

    // RE-01/02: run the department's automation rules on the new ticket.
    if (!isDraft) {
      try {
        await applyRulesToTicket(
          {
            id: ticket.id,
            tenantId: ticketTenantId,
            departmentId: ticket.subDepartment.departmentId,
            subDepartmentId: ticket.subDepartment.id,
            assigneeId: ticket.assignee?.id ?? null,
          },
          { priority, type, title, description, labels },
        )
      } catch (err) {
        console.error("[POST /api/tickets] applyRulesToTicket failed:", err)
      }
    }

    try {
      await appendTicketEvent(ticket.id, profile.id, "TICKET_CREATED", {
        humanId,
        title,
        status,
      })
    } catch (err) {
      console.error("[POST /api/tickets] appendTicketEvent(TICKET_CREATED) failed:", err)
    }

    // Batched assignments already joined in the save transaction.
    try {
      if (coAssigneeIds.length === 0) await ensureProjectMembers(resolvedProjectId, [assigneeId])
    } catch (err) {
      console.error("[POST /api/tickets] ensureProjectMembers failed:", err)
    }

    for (const assignee of coAssignees) {
      await appendTicketEvent(ticket.id, profile.id, "CO_ASSIGNEE_ADDED", {
        userId: assignee.id,
        userName: assignee.name,
      }).catch(err => console.error("[co-assignee activity] failed:", err))
      if (!isDraft) {
        await createNotification({
          recipientId: assignee.id,
          actorId: profile.id,
          type: "assignment",
          ticketId: ticket.id,
          message: title,
        }).catch(err => console.error("[co-assignee notification] failed:", err))
        await sendAssignmentEmail({
          to: assignee.email,
          assigneeName: assignee.name,
          assigneeId: assignee.id,
          ticketId: ticket.id,
          humanId,
          ticketTitle: title,
          assignedByName: profile.name,
          assignedById: profile.id,
          departmentId: ticket.subDepartment.departmentId,
          subDepartmentId: ticket.subDepartment.id,
        }).catch(err => console.error("[co-assignee email] failed:", err))
      }
    }

    // Record the sub-ticket on its parent's timeline so it shows up in the
    // parent's activity feed and pushes a live update to everyone viewing it.
    if (parentId && !isDraft) {
      await appendTicketEvent(parentId, profile.id, "SUBTICKET_ADDED", {
        humanId,
        title,
        subTicketId: ticket.id,
      }).catch(() => undefined)
    }

    // Drafts may have assignees selected, but never notify until published.
    if (!isDraft && ticket.assignee) {
      try {
        await createNotification({
          recipientId: ticket.assignee.id,
          actorId: profile.id,
          type: "assignment",
          ticketId: ticket.id,
          message: title,
        })
      } catch (err) {
        console.error("[POST /api/tickets] createNotification failed:", err)
      }
      if (ticket.assignee.id !== profile.id) {
        await sendAssignmentEmail({
          to: ticket.assignee.email,
          assigneeName: ticket.assignee.name,
          assigneeId: ticket.assignee.id,
          ticketId: ticket.id,
          humanId,
          ticketTitle: title,
          assignedByName: profile.name,
          assignedById: profile.id,
          departmentId: ticket.subDepartment.departmentId,
          subDepartmentId: ticket.subDepartment.id,
        }).catch((err) => console.error("[assignment email] failed:", err))
      }
    }
  }))

  return NextResponse.json(ticket, { status: 201 })
}
