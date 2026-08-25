import { prisma } from "@/lib/db"
import { createNotification } from "@/lib/notify"
import { sendAssignmentEmail, sendResolutionEmail } from "@/lib/email"
import { resolveMiscProjectForSubDepartment } from "@/lib/misc-project"
import { appendTicketEvent, broadcastTicketEvent } from "@/lib/ticket-events"
import { resolveMentionedProfiles, processMentions } from "@/lib/mentions"
import { ensureProjectMembers } from "@/lib/ensure-project-members"
import { notifyTicketCompletion } from "@/lib/ticket-completion-notify"
import { cascadeCompleteToSubtickets } from "@/lib/ticket-cascade"
import { stopRunningTimersOnStatusChange } from "@/lib/timer-autostop"
import { startSlaTimers } from "@/lib/sla-engine"
import { BASE_URL } from "@/lib/email-templates/_shared"
import type { ApiKeyContext } from "@/lib/api-key-auth"
import {
  resolveCurrentStage,
  resolveLifecycleStages,
  toLifecycleStageApi,
  toLifecycleStagesApi,
} from "@/lib/project-lifecycle"

export type ToolResult = { ok: true; data: unknown } | { ok: false; message: string }

export const TICKET_TYPES = ["Bug", "Feature", "Task", "Chore"] as const
export const TICKET_PRIORITIES = ["Low", "Medium", "High", "Critical", "Urgent"] as const

const REF_RE = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/

/** Dept filter for teams: an API key scoped to a department sees only its teams. */
function subDepartmentWhere(ctx: ApiKeyContext) {
  return ctx.departmentId ? { departmentId: ctx.departmentId } : {}
}

export async function listSubDepartments(ctx: ApiKeyContext): Promise<ToolResult> {
  const subDepartments = await prisma.subDepartment.findMany({
    where: subDepartmentWhere(ctx),
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      department: { select: { name: true } },
      statuses: { orderBy: { order: "asc" }, select: { label: true, isComplete: true } },
    },
  })
  return {
    ok: true,
    data: subDepartments.map((t) => ({
      id: t.id,
      name: t.name,
      prefix: t.prefix,
      department: t.department.name,
      statuses: t.statuses.map((s) => s.label),
    })),
  }
}

export async function listProjects(ctx: ApiKeyContext): Promise<ToolResult> {
  const where = ctx.departmentId
    ? {
        OR: [
          { departmentId: ctx.departmentId },
          { subDepartment: { departmentId: ctx.departmentId } },
        ],
      }
    : {}
  const projects = await prisma.project.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      projectStatus: true,
      lifecycleStages: true,
      pipelineStartedAt: true,
      developmentStartedAt: true,
      liveAt: true,
      subDepartment: { select: { name: true, prefix: true } },
      department: { select: { name: true } },
    },
  })
  return {
    ok: true,
    data: projects.map((p) => {
      const stages = resolveLifecycleStages(p)
      const current = resolveCurrentStage(stages, p.projectStatus)
      return {
        id: p.id,
        name: p.name,
        status: p.projectStatus,
        currentStage: current ? toLifecycleStageApi(current) : null,
        stages: toLifecycleStagesApi(stages),
        subDepartment: p.subDepartment?.name ?? null,
        subDepartmentPrefix: p.subDepartment?.prefix ?? null,
        department: p.department?.name ?? null,
      }
    }),
  }
}

export async function searchTickets(
  ctx: ApiKeyContext,
  input: { query?: string; status?: string; subDepartmentPrefix?: string; limit?: number },
): Promise<ToolResult> {
  const take = Math.min(Math.max(input.limit ?? 20, 1), 50)
  const where: Record<string, unknown> = { deletedAt: null }
  if (input.query) where.title = { contains: input.query, mode: "insensitive" }
  if (input.status) where.status = input.status
  if (input.subDepartmentPrefix && ctx.departmentId) {
    where.subDepartment = { departmentId: ctx.departmentId, prefix: input.subDepartmentPrefix.toUpperCase() }
  } else if (input.subDepartmentPrefix) {
    where.subDepartment = { prefix: input.subDepartmentPrefix.toUpperCase() }
  } else if (ctx.departmentId) {
    where.subDepartment = { departmentId: ctx.departmentId }
  }

  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    select: {
      ticketNumber: true,
      title: true,
      status: true,
      priority: true,
      subDepartment: { select: { prefix: true } },
      assignee: { select: { name: true } },
      project: { select: { name: true } },
      sprint: { select: { name: true } },
      module: { select: { name: true } },
    },
  })
  return {
    ok: true,
    data: tickets.map((t) => ({
      ref: `${t.subDepartment.prefix}-${t.ticketNumber}`,
      title: t.title,
      status: t.status,
      priority: t.priority,
      assignee: t.assignee?.name ?? null,
      project: t.project?.name ?? null,
      sprint: t.sprint?.name ?? null,
      module: t.module?.name ?? null,
    })),
  }
}

export async function getTicket(
  ctx: ApiKeyContext,
  input: { ref: string },
): Promise<ToolResult> {
  const match = input.ref.trim().match(REF_RE)
  if (!match) {
    return {
      ok: false,
      message: `Could not parse "${input.ref}" — expected a ticket reference like WEB-123`,
    }
  }
  const prefix = match[1].toUpperCase()
  const number = parseInt(match[2], 10)

  const ticket = await prisma.ticket.findFirst({
    where: {
      ticketNumber: number,
      deletedAt: null,
      subDepartment: { prefix, ...subDepartmentWhere(ctx) },
    },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      priority: true,
      status: true,
      labels: true,
      startDate: true,
      dueDate: true,
      createdAt: true,
      subDepartment: { select: { name: true, prefix: true } },
      project: { select: { name: true } },
      creator: { select: { name: true } },
      assignee: { select: { name: true } },
      assignees: { select: { user: { select: { name: true } } } },
      sprint: { select: { name: true } },
      module: { select: { name: true } },
      comments: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { body: true, createdAt: true, author: { select: { name: true } } },
      },
    },
  })
  if (!ticket) {
    return { ok: false, message: `Ticket ${prefix}-${number} not found (or outside this key's department)` }
  }
  return {
    ok: true,
    data: {
      ref: `${ticket.subDepartment.prefix}-${number}`,
      url: `${BASE_URL}/tasks/${ticket.id}`,
      title: ticket.title,
      description: ticket.description,
      type: ticket.type,
      priority: ticket.priority,
      status: ticket.status,
      labels: ticket.labels,
      subDepartment: ticket.subDepartment.name,
      project: ticket.project?.name ?? null,
      sprint: ticket.sprint?.name ?? null,
      module: ticket.module?.name ?? null,
      creator: ticket.creator.name,
      assignee: ticket.assignee?.name ?? null,
      coAssignees: ticket.assignees.map((a) => a.user.name),
      startDate: ticket.startDate,
      dueDate: ticket.dueDate,
      createdAt: ticket.createdAt,
      recentComments: ticket.comments.map((c) => ({
        author: c.author.name,
        at: c.createdAt,
        body: c.body,
      })),
    },
  }
}

export async function createTicket(
  ctx: ApiKeyContext,
  input: {
    title: string
    description?: string
    type: (typeof TICKET_TYPES)[number]
    priority: (typeof TICKET_PRIORITIES)[number]
    subDepartmentPrefix: string
    projectId?: string
    assigneeEmail?: string
  },
): Promise<ToolResult> {
  if (ctx.scope !== "read_write" && ctx.scope !== "admin") {
    return {
      ok: false,
      message: "This API key is read-only — ticket creation requires a read_write key",
    }
  }

  const subDepartment = await prisma.subDepartment.findFirst({
    where: { prefix: input.subDepartmentPrefix.toUpperCase(), ...subDepartmentWhere(ctx) },
    select: { id: true, name: true, prefix: true, departmentId: true, tenantId: true },
  })
  if (!subDepartment) {
    return {
      ok: false,
      message: `No team with prefix "${input.subDepartmentPrefix}" in this key's scope — call list_teams for valid prefixes`,
    }
  }

  let assignee: { id: string; name: string; email: string } | null = null
  if (input.assigneeEmail) {
    assignee = await prisma.profile.findFirst({
      where: { email: { equals: input.assigneeEmail.trim(), mode: "insensitive" }, deletedAt: null },
      select: { id: true, name: true, email: true },
    })
    if (!assignee) {
      return { ok: false, message: `No user found with email ${input.assigneeEmail}` }
    }
  }

  let projectId = input.projectId ?? null
  if (projectId) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        ...(ctx.departmentId
          ? { OR: [{ departmentId: ctx.departmentId }, { subDepartment: { departmentId: ctx.departmentId } }] }
          : {}),
      },
      select: { id: true, kind: true },
    })
    if (!project) {
      return { ok: false, message: "Project not found (or outside this key's department) — call list_projects" }
    }
    if (project.kind === "support") {
      return { ok: false, message: "Support projects only accept tickets from the support form" }
    }
  } else {
    projectId = await resolveMiscProjectForSubDepartment(subDepartment.id)
  }

  const firstStatus = await prisma.subDepartmentStatus.findFirst({
    where: { subDepartmentId: subDepartment.id },
    orderBy: { order: "asc" },
    select: { label: true },
  })

  const now = new Date()
  const endOfDay = new Date(now)
  endOfDay.setHours(23, 59, 59, 999)

  // ticketNumber: 0 is a placeholder — the BEFORE INSERT trigger stamps the real per-team value
  const ticket = await prisma.ticket.create({
    data: {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      type: input.type,
      priority: input.priority,
      status: firstStatus?.label ?? "To Do",
      ticketNumber: 0,
      startDate: now,
      dueDate: endOfDay,
      creator: { connect: { id: ctx.createdById } },
      tenant: { connect: { id: subDepartment.tenantId } },
      subDepartment: { connect: { id: subDepartment.id } },
      project: { connect: { id: projectId } },
      ...(assignee ? { assignee: { connect: { id: assignee.id } } } : {}),
    },
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      status: true,
      createdAt: true,
      subDepartment: { select: { prefix: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
  })

  const humanId = `${ticket.subDepartment.prefix}-${ticket.ticketNumber}`

  if (subDepartment.departmentId) {
    await startSlaTimers(
      ticket.id,
      subDepartment.tenantId,
      subDepartment.departmentId,
      { priority: input.priority, type: input.type, title: input.title },
      ticket.createdAt,
      subDepartment.id,
    )
  }

  await appendTicketEvent(ticket.id, ctx.createdById, "TICKET_CREATED", {
    humanId,
    title: ticket.title,
    status: ticket.status,
  })

  await ensureProjectMembers(projectId, [ticket.assignee?.id])

  if (ticket.assignee) {
    await createNotification({
      recipientId: ticket.assignee.id,
      actorId: ctx.createdById,
      type: "assignment",
      ticketId: ticket.id,
      message: ticket.title,
    })
    if (ticket.assignee.id !== ctx.createdById) {
      sendAssignmentEmail({
        to: ticket.assignee.email,
        assigneeName: ticket.assignee.name,
        assigneeId: ticket.assignee.id,
        ticketId: ticket.id,
        humanId,
        ticketTitle: ticket.title,
        assignedByName: ctx.creatorName,
        departmentId: subDepartment.departmentId,
        subDepartmentId: subDepartment.id,
      }).catch(() => undefined)
    }
  }

  return {
    ok: true,
    data: {
      humanId,
      id: ticket.id,
      url: `${BASE_URL}/tasks/${ticket.id}`,
      assignee: ticket.assignee?.name ?? null,
    },
  }
}

export type UpdateTicketInput = {
  ref: string
  title?: string
  description?: string | null
  type?: (typeof TICKET_TYPES)[number]
  priority?: (typeof TICKET_PRIORITIES)[number]
  status?: string
  assigneeEmail?: string | null
  projectId?: string | null
  sprintId?: string | null
  moduleId?: string | null
}

const TICKET_SELECT_FOR_UPDATE = {
  id: true, title: true, description: true, type: true, priority: true,
  status: true, labels: true, closedAt: true, ticketNumber: true,
  subDepartmentId: true, projectId: true, sprintId: true, moduleId: true,
  assigneeId: true, creatorId: true,
  subDepartment: { select: { prefix: true, departmentId: true } },
  assignee: { select: { id: true, name: true } },
  sprint: { select: { id: true, name: true } },
  module: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  intake: { select: { submitterName: true, submitterEmail: true, formConfig: { select: { name: true } } } },
} as const

export async function updateTicket(ctx: ApiKeyContext, input: UpdateTicketInput): Promise<ToolResult> {
  if (ctx.scope !== "read_write" && ctx.scope !== "admin") {
    return { ok: false, message: "This API key is read-only — ticket updates require a read_write key" }
  }

  const match = input.ref.trim().match(REF_RE)
  if (!match) {
    return { ok: false, message: `Could not parse "${input.ref}" — expected a ticket reference like WEB-123` }
  }
  const prefix = match[1].toUpperCase()
  const number = parseInt(match[2], 10)

  const ticket = await prisma.ticket.findFirst({
    where: { ticketNumber: number, deletedAt: null, subDepartment: { prefix, ...subDepartmentWhere(ctx) } },
    select: TICKET_SELECT_FOR_UPDATE,
  })
  if (!ticket) {
    return { ok: false, message: `Ticket ${prefix}-${number} not found (or outside this key's department)` }
  }

  const data: Record<string, unknown> = {}
  const changed: Record<string, { from: unknown; to: unknown }> = {}
  const events: Array<() => Promise<void>> = []
  const actorId = ctx.createdById

  if (input.title !== undefined) {
    const title = input.title.trim()
    if (!title) return { ok: false, message: "title cannot be empty" }
    if (title !== ticket.title) {
      data.title = title
      changed.title = { from: ticket.title, to: title }
      events.push(() => appendTicketEvent(ticket.id, actorId, "TITLE_CHANGED", { from: ticket.title, to: title }))
    }
  }

  if (input.description !== undefined) {
    const description = input.description === null ? null : input.description.trim() || null
    if (description !== ticket.description) {
      data.description = description
      changed.description = { from: ticket.description, to: description }
      events.push(() => appendTicketEvent(ticket.id, actorId, "DESCRIPTION_CHANGED", {
        hadDescription: !!ticket.description, to: description,
      }))
    }
  }

  if (input.type !== undefined && input.type !== ticket.type) {
    data.type = input.type
    changed.type = { from: ticket.type, to: input.type }
  }

  if (input.priority !== undefined && input.priority !== ticket.priority) {
    const priority = input.priority
    data.priority = priority
    changed.priority = { from: ticket.priority, to: priority }
    events.push(() => appendTicketEvent(ticket.id, actorId, "PRIORITY_CHANGED", {
      from: ticket.priority, to: priority,
    }))
  }

  let newAssignee: { id: string; name: string; email: string } | null | undefined // undefined = not requested
  if (input.assigneeEmail !== undefined) {
    if (input.assigneeEmail === null) {
      newAssignee = null
    } else {
      newAssignee = await prisma.profile.findFirst({
        where: { email: { equals: input.assigneeEmail.trim(), mode: "insensitive" }, deletedAt: null },
        select: { id: true, name: true, email: true },
      })
      if (!newAssignee) return { ok: false, message: `No user found with email ${input.assigneeEmail}` }
    }
    const newId = newAssignee?.id ?? null
    if (newId !== ticket.assigneeId) {
      data.assigneeId = newId
      changed.assignee = { from: ticket.assignee?.name ?? null, to: newAssignee?.name ?? null }
      const toName = newAssignee?.name ?? null
      events.push(() => appendTicketEvent(ticket.id, actorId, "ASSIGNED", {
        fromId: ticket.assigneeId, fromName: ticket.assignee?.name ?? null,
        toId: newId, toName,
      }))
    } else {
      newAssignee = undefined
    }
  }

  let newProject: { id: string; name: string } | null | undefined
  if (input.projectId !== undefined && input.projectId !== ticket.projectId) {
    if (input.projectId === null) {
      return { ok: false, message: "Tickets always belong to a project — pass a projectId from list_projects instead of null" }
    }
    const project = await prisma.project.findFirst({
      where: {
        id: input.projectId,
        ...(ctx.departmentId
          ? { OR: [{ departmentId: ctx.departmentId }, { subDepartment: { departmentId: ctx.departmentId } }] }
          : {}),
      },
      select: { id: true, kind: true, name: true },
    })
    if (!project) return { ok: false, message: "Project not found (or outside this key's department) — call list_projects" }
    if (project.kind === "support") return { ok: false, message: "Support projects only accept tickets from the support form" }
    newProject = project
    data.projectId = project.id
    // Moving project clears the module unless one was explicitly provided (mirrors PATCH /api/tickets/[id])
    if (input.moduleId === undefined) data.moduleId = null
    changed.project = { from: ticket.project?.name ?? null, to: project.name }
    events.push(() => appendTicketEvent(ticket.id, actorId, "PROJECT_CHANGED", {
      fromId: ticket.project?.id ?? null, fromName: ticket.project?.name ?? null,
      toId: project.id, toName: project.name,
    }))
  }

  if (input.sprintId !== undefined && input.sprintId !== ticket.sprintId) {
    let sprintName: string | null = null
    if (input.sprintId !== null) {
      const sprint = await prisma.sprint.findFirst({ where: { id: input.sprintId }, select: { id: true, name: true } })
      if (!sprint) return { ok: false, message: `Sprint not found: ${input.sprintId}` }
      sprintName = sprint.name
    }
    data.sprintId = input.sprintId
    changed.sprint = { from: ticket.sprint?.name ?? null, to: sprintName }
    const toSprintId = input.sprintId
    events.push(() => appendTicketEvent(ticket.id, actorId, "SPRINT_CHANGED", {
      fromId: ticket.sprint?.id ?? null, fromName: ticket.sprint?.name ?? null,
      toId: toSprintId, toName: sprintName,
    }))
  }

  if (input.moduleId !== undefined && input.moduleId !== ticket.moduleId) {
    let moduleName: string | null = null
    if (input.moduleId !== null) {
      const mod = await prisma.projectModule.findFirst({ where: { id: input.moduleId }, select: { id: true, name: true } })
      if (!mod) return { ok: false, message: `Module not found: ${input.moduleId}` }
      moduleName = mod.name
    }
    data.moduleId = input.moduleId
    changed.module = { from: ticket.module?.name ?? null, to: moduleName }
    const toModuleId = input.moduleId
    events.push(() => appendTicketEvent(ticket.id, actorId, "MODULE_CHANGED", {
      fromId: ticket.module?.id ?? null, fromName: ticket.module?.name ?? null,
      toId: toModuleId, toName: moduleName,
    }))
  }

  let statusChange: { to: string; isComplete: boolean } | null = null
  if (input.status !== undefined && input.status !== ticket.status) {
    const subDepartmentStatuses = await prisma.subDepartmentStatus.findMany({
      where: { subDepartmentId: ticket.subDepartmentId },
      orderBy: { order: "asc" },
      select: { label: true, isComplete: true },
    })
    const target = subDepartmentStatuses.find((s) => s.label === input.status)
    if (!target) {
      return {
        ok: false,
        message: `Invalid status "${input.status}" for this team — valid: ${subDepartmentStatuses.map((s) => s.label).join(", ")}`,
      }
    }
    statusChange = { to: target.label, isComplete: target.isComplete }
    data.status = target.label
    data.closedAt = target.isComplete ? (ticket.closedAt ?? new Date()) : null
    changed.status = { from: ticket.status, to: target.label }
  }

  if (Object.keys(data).length === 0) {
    return { ok: true, data: { ref: `${prefix}-${number}`, changed } }
  }

  if (statusChange) {
    // The status trigger writes the ActivityLog row itself; set_config stamps
    // the key owner as its actor (same pattern as PATCH /api/tickets/[id]/status).
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${actorId}, true)`
      await tx.ticket.update({ where: { id: ticket.id }, data })
    })
  } else {
    await prisma.ticket.update({ where: { id: ticket.id }, data })
  }
  await Promise.all(events.map((fire) => fire().catch(() => undefined)))

  const projectForMembers = (data.projectId as string | undefined) ?? ticket.projectId
  if (newAssignee) {
    await ensureProjectMembers(projectForMembers, [newAssignee.id])
    await createNotification({
      recipientId: newAssignee.id, actorId, type: "assignment", ticketId: ticket.id, message: ticket.title,
    })
    if (newAssignee.id !== actorId) {
      sendAssignmentEmail({
        to: newAssignee.email, assigneeName: newAssignee.name, assigneeId: newAssignee.id,
        ticketId: ticket.id, humanId: `${prefix}-${number}`, ticketTitle: ticket.title,
        assignedByName: ctx.creatorName, departmentId: ticket.subDepartment.departmentId,
        subDepartmentId: ticket.subDepartmentId,
      }).catch(() => undefined)
    }
  } else if (newProject) {
    await ensureProjectMembers(projectForMembers, [ticket.assigneeId])
  }

  if (statusChange) {
    broadcastTicketEvent(ticket.id, "STATUS_CHANGED", actorId, {
      from: ticket.status, to: statusChange.to,
    }).catch(() => undefined)
    await stopRunningTimersOnStatusChange(ticket.id, statusChange.to)
    if (statusChange.isComplete) {
      const humanId = `${prefix}-${number}`
      notifyTicketCompletion({
        ticketId: ticket.id, ticketTitle: ticket.title, humanId,
        subDepartmentId: ticket.subDepartmentId, creatorId: ticket.creatorId,
        actorId, actorName: ctx.creatorName,
      }).catch(() => undefined)
      cascadeCompleteToSubtickets(ticket.id).catch(() => undefined)
      if (ticket.intake) {
        sendResolutionEmail({
          to: ticket.intake.submitterEmail, submitterName: ticket.intake.submitterName,
          formName: ticket.intake.formConfig.name, ticketTitle: ticket.title,
          departmentId: ticket.subDepartment.departmentId,
          subDepartmentId: ticket.subDepartmentId,
        }).catch(() => undefined)
      }
    }
  }

  return { ok: true, data: { ref: `${prefix}-${number}`, changed } }
}

export async function addComment(
  ctx: ApiKeyContext,
  input: { ref: string; body: string },
): Promise<ToolResult> {
  if (ctx.scope !== "read_write" && ctx.scope !== "admin") {
    return { ok: false, message: "This API key is read-only — commenting requires a read_write key" }
  }
  const body = input.body?.trim()
  if (!body) return { ok: false, message: "Comment body is required" }

  const match = input.ref.trim().match(REF_RE)
  if (!match) {
    return { ok: false, message: `Could not parse "${input.ref}" — expected a ticket reference like WEB-123` }
  }
  const prefix = match[1].toUpperCase()
  const number = parseInt(match[2], 10)

  const ticket = await prisma.ticket.findFirst({
    where: { ticketNumber: number, deletedAt: null, subDepartment: { prefix, ...subDepartmentWhere(ctx) } },
    select: {
      id: true, title: true, creatorId: true, assigneeId: true,
      assignees: { select: { userId: true } },
      subDepartment: { select: { prefix: true } },
    },
  })
  if (!ticket) {
    return { ok: false, message: `Ticket ${prefix}-${number} not found (or outside this key's department)` }
  }

  const comment = await prisma.comment.create({
    data: { ticketId: ticket.id, authorId: ctx.createdById, body },
    select: { id: true },
  })

  await appendTicketEvent(ticket.id, ctx.createdById, "COMMENT_ADDED", { commentId: comment.id })

  const mentioned = await resolveMentionedProfiles(body, ticket.id)
  const mentionedIds = new Set(mentioned.map((p) => p.id))
  processMentions({
    commentId: comment.id, ticketId: ticket.id, actorId: ctx.createdById,
    actorName: ctx.creatorName, body, ticketTitle: ticket.title,
  }).catch(() => undefined)

  const snippet = body.length > 140 ? `${body.slice(0, 137)}...` : body
  const recipients = new Set(
    [ticket.creatorId, ticket.assigneeId, ...ticket.assignees.map((a) => a.userId)].filter(Boolean) as string[],
  )
  for (const recipientId of recipients) {
    if (mentionedIds.has(recipientId) || recipientId === ctx.createdById) continue
    createNotification({
      recipientId, actorId: ctx.createdById, type: "comment",
      ticketId: ticket.id, commentId: comment.id, message: snippet,
    }).catch(() => undefined)
  }

  return {
    ok: true,
    data: { ref: `${prefix}-${number}`, commentId: comment.id, url: `${BASE_URL}/tasks/${ticket.id}` },
  }
}

export async function deleteTicket(
  ctx: ApiKeyContext,
  input: { ref: string },
): Promise<ToolResult> {
  if (ctx.scope !== "admin") {
    return { ok: false, message: "Deleting tickets requires an admin API key" }
  }

  const match = input.ref.trim().match(REF_RE)
  if (!match) {
    return { ok: false, message: `Could not parse "${input.ref}" — expected a ticket reference like WEB-123` }
  }
  const prefix = match[1].toUpperCase()
  const number = parseInt(match[2], 10)

  // No deletedAt filter — deletion is idempotent, mirroring DELETE /api/tickets/[id]
  const ticket = await prisma.ticket.findFirst({
    where: { ticketNumber: number, subDepartment: { prefix, ...subDepartmentWhere(ctx) } },
    select: {
      id: true, title: true, ticketNumber: true, deletedAt: true, assigneeId: true,
      assignees: { select: { userId: true } },
      subDepartment: { select: { prefix: true } },
    },
  })
  if (!ticket) {
    return { ok: false, message: `Ticket ${prefix}-${number} not found (or outside this key's department)` }
  }

  const humanId = `${prefix}-${number}`
  if (ticket.deletedAt) {
    return { ok: true, data: { ref: humanId, alreadyDeleted: true } }
  }

  await prisma.ticket.update({ where: { id: ticket.id }, data: { deletedAt: new Date() } })

  await prisma.activityLog.create({
    data: {
      ticketId: ticket.id, actorId: ctx.createdById, action: "TICKET_DELETED",
      metadata: { humanId, title: ticket.title },
    },
  }).catch(() => undefined)

  const recipients = [
    ...(ticket.assigneeId ? [ticket.assigneeId] : []),
    ...ticket.assignees.map((a) => a.userId),
  ].filter((uid, i, arr) => uid !== ctx.createdById && arr.indexOf(uid) === i)
  for (const recipientId of recipients) {
    createNotification({
      recipientId, actorId: ctx.createdById, type: "ticket_deleted",
      ticketId: ticket.id, message: humanId,
    }).catch(() => undefined)
  }

  return { ok: true, data: { ref: humanId, alreadyDeleted: false } }
}
