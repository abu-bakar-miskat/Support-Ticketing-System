import { NextRequest, NextResponse, after } from "next/server"
import { requireAuth, assertTicketAccess, assertTicketEditAccess } from "@/lib/auth"
import { prisma } from "@/lib/db"
import type { Prisma } from "@/generated/prisma/client"
import { sendAssignmentEmail } from "@/lib/email"
import { createNotification } from "@/lib/notify"
import { canEditTicket, canEditTicketDescription, canEditTicketDates, canDeleteTicket } from "@/lib/ticket-date-permissions"
import { buildTicketEditContext } from "@/lib/cross-access"
import { cascadeCompleteToSubtickets } from "@/lib/ticket-cascade"
import { parseStartDatePayload, parseDueDatePayload, formatCalendarDate, dueHasTime, formatTimeHM } from "@/lib/ticket-datetime"
import { assertAssigneeEligibleForTicket } from "@/lib/ticket-detail-data"
import { appendTicketEvent } from "@/lib/ticket-events"
import { ensureProjectMembers } from "@/lib/ensure-project-members"
const VALID_PRIORITIES = ["Low", "Medium", "High", "Critical", "Urgent"] as const
type TicketPriority = (typeof VALID_PRIORITIES)[number]

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params

  // Fetch the full before-state so we can compute diffs for event sourcing.
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      subDepartment:    { select: { prefix: true, departmentId: true } },
      assignee:{ select: { id: true, name: true } },
      creator: { select: { id: true } },
      assignees: { select: { userId: true } },
      sprint:  { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      module:  { select: { id: true, name: true } },
    },
  })

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
  }

  const accessError = await assertTicketAccess(profile, ticket, { forWrite: true })
  if (accessError) return accessError

  const body = await request.json().catch(() => ({}))

  const hasTitle         = "title" in body
  const hasAssignee      = "assigneeId" in body
  const hasPriority      = "priority" in body
  const hasStatus        = "status" in body
  const hasStartDate     = "startDate" in body
  const hasDueDate       = "dueDate" in body
  const hasDescription   = "description" in body
  const hasStoryPoints   = "storyPoints" in body
  const hasEstimatedTime = "estimatedTime" in body
  const hasProjectId     = "projectId" in body
  const hasModuleId      = "moduleId" in body
  const hasSprintId      = "sprintId" in body
  const hasLabels        = "labels" in body
  const hasAssetLinks    = "assetLinks" in body
  const hasParentId      = "parentId" in body
  const hasIsDraft       = "isDraft" in body
  const hasTemplateData  = "templateData" in body

  if (
    !hasTitle && !hasAssignee && !hasPriority && !hasStatus &&
    !hasStartDate && !hasDueDate && !hasDescription && !hasStoryPoints &&
    !hasEstimatedTime && !hasProjectId && !hasModuleId && !hasSprintId &&
    !hasLabels && !hasAssetLinks && !hasParentId && !hasIsDraft && !hasTemplateData
  ) {
    return NextResponse.json({ error: "At least one field is required" }, { status: 400 })
  }

  const editCtx = await buildTicketEditContext(profile, ticket)

  const hasNonDescriptionEdit =
    hasTitle || hasAssignee || hasPriority || hasStatus ||
    hasStartDate || hasDueDate || hasStoryPoints || hasEstimatedTime ||
    hasProjectId || hasModuleId || hasSprintId || hasLabels || hasAssetLinks ||
    hasParentId || hasIsDraft || hasTemplateData

  if (hasNonDescriptionEdit && !canEditTicket(profile, editCtx)) {
    return NextResponse.json(
      { error: "You can only edit tickets you are assigned to, co-assigned to, created, or lead the team for" },
      { status: 403 },
    )
  }

  if (hasDescription && !canEditTicketDescription(profile, editCtx)) {
    return NextResponse.json(
      { error: "You can only edit the description if you created the ticket, are assigned to it, co-assigned to it, or manage its department" },
      { status: 403 },
    )
  }

  const updateData: {
    title?: string
    assigneeId?: string | null
    priority?: TicketPriority
    status?: string
    closedAt?: Date | null
    startDate?: Date | null
    dueDate?: Date | null
    description?: string | null
    storyPoints?: number | null
    estimatedTime?: number | null
    projectId?: string | null
    moduleId?: string | null
    sprintId?: string | null
    labels?: string[]
    assetLinks?: { label: string; url: string }[]
    parentId?: string | null
    isDraft?: boolean
    templateData?: Prisma.InputJsonValue | null
  } = {}

  if (hasTitle) {
    const t = typeof body.title === "string" ? body.title.trim() : ""
    if (!t) return NextResponse.json({ error: "title must be a non-empty string" }, { status: 400 })
    updateData.title = t
  }

  if (hasDescription) {
    updateData.description = typeof body.description === "string" ? body.description.trim() || null : null
  }

  if (hasStoryPoints) {
    const sp = body.storyPoints
    updateData.storyPoints = sp === null ? null : typeof sp === "number" ? Math.max(0, Math.round(sp)) : null
  }

  if (hasEstimatedTime) {
    const et = body.estimatedTime
    updateData.estimatedTime = et === null ? null : typeof et === "number" ? Math.max(0, Math.round(et)) : null
  }

  if (hasStatus) {
    const status = body.status as string
    if (!status || typeof status !== "string") {
      return NextResponse.json({ error: "status must be a non-empty string" }, { status: 400 })
    }
    updateData.status = status.trim()
    const subDepartmentStatus = await prisma.subDepartmentStatus.findFirst({
      where: { subDepartmentId: ticket.subDepartmentId, label: updateData.status },
      select: { isComplete: true },
    })
    updateData.closedAt = subDepartmentStatus?.isComplete ? (ticket.closedAt ?? new Date()) : null
  }

  if (hasPriority) {
    const priority = body.priority as string
    if (!VALID_PRIORITIES.includes(priority as TicketPriority)) {
      return NextResponse.json(
        { error: `priority must be one of: ${VALID_PRIORITIES.join(", ")}` },
        { status: 400 },
      )
    }
    updateData.priority = priority as TicketPriority
  }

  if (hasStartDate || hasDueDate) {
    const canEditDates = canEditTicketDates(profile, await buildTicketEditContext(profile, ticket))
    if (!canEditDates) {
      return NextResponse.json({ error: "You can only change dates on tickets assigned to you" }, { status: 403 })
    }
    if (hasStartDate && body.startDate === null && ticket.startDate !== null) {
      return NextResponse.json({ error: "Date range cannot be removed once set" }, { status: 400 })
    }
    if (hasDueDate && body.dueDate === null && ticket.dueDate !== null) {
      return NextResponse.json({ error: "Date range cannot be removed once set" }, { status: 400 })
    }
  }
  if (hasStartDate) updateData.startDate = body.startDate ? parseStartDatePayload(body.startDate as string) : null
  if (hasDueDate)   updateData.dueDate   = body.dueDate   ? parseDueDatePayload(body.dueDate as string)     : null

  const newAssigneeId  = hasAssignee ? ((body.assigneeId as string | null) || null) : undefined
  const prevAssigneeId = ticket.assigneeId ?? null

  if (hasAssignee) {
    if (typeof newAssigneeId === "string" && newAssigneeId !== prevAssigneeId) {
      const eligibility = await assertAssigneeEligibleForTicket(ticket, newAssigneeId)
      if (!eligibility.ok) return NextResponse.json({ error: eligibility.error }, { status: 400 })
    }
    updateData.assigneeId = newAssigneeId!
  }

  const publishing = hasIsDraft && body.isDraft === false && ticket.isDraft === true
  if (hasIsDraft) {
    if (body.isDraft === true) {
      if (!ticket.isDraft) {
        return NextResponse.json({ error: "Published tickets cannot be converted back to drafts" }, { status: 400 })
      }
      updateData.isDraft = true
    } else if (body.isDraft === false) {
      updateData.isDraft = false
    } else {
      return NextResponse.json({ error: "isDraft must be a boolean" }, { status: 400 })
    }
  }

  if (hasProjectId) {
    const pid = body.projectId as string | null
    if (pid !== null && typeof pid !== "string") {
      return NextResponse.json({ error: "projectId must be a string or null" }, { status: 400 })
    }
    if (pid) {
      const project = await prisma.project.findUnique({ where: { id: pid }, select: { id: true } })
      if (!project) return NextResponse.json({ error: "Project not found" }, { status: 400 })
    }
    updateData.projectId = pid
  }

  if (hasModuleId) {
    const mid = body.moduleId as string | null
    if (mid !== null && typeof mid !== "string") {
      return NextResponse.json({ error: "moduleId must be a string or null" }, { status: 400 })
    }
    if (mid) {
      const effectiveProjectId = hasProjectId ? updateData.projectId : ticket.projectId
      const moduleRow = await prisma.projectModule.findUnique({
        where: { id: mid },
        select: { projectId: true, project: { select: { moduleSystemEnabled: true } } },
      })
      if (!moduleRow || !effectiveProjectId || moduleRow.projectId !== effectiveProjectId || !moduleRow.project.moduleSystemEnabled) {
        return NextResponse.json({ error: "Module does not belong to this ticket's project" }, { status: 400 })
      }
    }
    updateData.moduleId = mid
  } else if (hasProjectId && updateData.projectId !== ticket.projectId) {
    updateData.moduleId = null
  }

  if (hasSprintId) {
    const sid = body.sprintId as string | null
    if (sid !== null && typeof sid !== "string") {
      return NextResponse.json({ error: "sprintId must be a string or null" }, { status: 400 })
    }
    if (sid) {
      const sprintRow = await prisma.sprint.findUnique({ where: { id: sid }, select: { id: true } })
      if (!sprintRow) return NextResponse.json({ error: "Sprint not found" }, { status: 400 })
    }
    updateData.sprintId = sid
  }

  // Linking this ticket as a sub-ticket of another (or unlinking with null).
  if (hasParentId) {
    const pid = body.parentId as string | null
    if (pid !== null && typeof pid !== "string") {
      return NextResponse.json({ error: "parentId must be a string or null" }, { status: 400 })
    }
    if (pid === id) {
      return NextResponse.json({ error: "A ticket cannot be its own parent" }, { status: 400 })
    }
    if (pid) {
      const parent = await prisma.ticket.findUnique({
        where: { id: pid },
        select: {
          id: true,
          tenantId: true,
          subDepartmentId: true,
          projectId: true,
          parentId: true,
          assigneeId: true,
          creatorId: true,
          deletedAt: true,
          subDepartment: { select: { departmentId: true } },
          assignees: { select: { userId: true } },
        },
      })
      if (!parent || parent.deletedAt) {
        return NextResponse.json({ error: "Parent ticket not found" }, { status: 400 })
      }
      if ((parent.projectId ?? null) !== (ticket.projectId ?? null)) {
        return NextResponse.json({ error: "Parent ticket must be in the same project" }, { status: 400 })
      }
      // Cycle guard: walk up the prospective parent's ancestry — if this ticket
      // appears, linking would create a loop (A→B→…→A).
      let cursorParentId: string | null = parent.parentId
      let hops = 0
      while (cursorParentId && hops < 50) {
        if (cursorParentId === id) {
          return NextResponse.json({ error: "Cannot link: this would create a circular parent chain" }, { status: 400 })
        }
        const ancestor: { parentId: string | null } | null = await prisma.ticket.findUnique({
          where: { id: cursorParentId },
          select: { parentId: true },
        })
        cursorParentId = ancestor?.parentId ?? null
        hops++
      }
      const parentEditError = await assertTicketEditAccess(profile, parent)
      if (parentEditError) return parentEditError
    }
    updateData.parentId = pid
  }

  if (hasLabels) {
    const labelArr = body.labels
    if (!Array.isArray(labelArr) || !labelArr.every((l) => typeof l === "string")) {
      return NextResponse.json({ error: "labels must be an array of strings" }, { status: 400 })
    }
    updateData.labels = [...new Set(labelArr.map((l: string) => l.trim()).filter(Boolean))]
  }

  // Moving off a status drops any labels linked to it (e.g. board drag-and-drop,
  // which changes status through this generic endpoint rather than /move).
  if (hasStatus && updateData.status !== ticket.status) {
    const priorStatus = await prisma.subDepartmentStatus.findFirst({
      where: { subDepartmentId: ticket.subDepartmentId, label: ticket.status },
      select: { allowedLabels: true },
    })
    if (priorStatus?.allowedLabels.length) {
      const base = updateData.labels ?? ticket.labels
      const stripped = base.filter((l) => priorStatus.allowedLabels.includes(l))
      if (stripped.length) {
        updateData.labels = base.filter((l) => !stripped.includes(l))
      }
    }
  }

  if (hasAssetLinks) {
    const arr = body.assetLinks
    if (!Array.isArray(arr) || !arr.every((a) => typeof a?.url === "string")) {
      return NextResponse.json({ error: "assetLinks must be an array of {label, url} objects" }, { status: 400 })
    }
    updateData.assetLinks = arr.map((a) => ({ label: (a.label ?? "").trim(), url: a.url.trim() })).filter((a) => a.url)
  }

  if (hasTemplateData) {
    const td = body.templateData
    if (td !== null && (typeof td !== "object" || Array.isArray(td))) {
      return NextResponse.json(
        { error: "templateData must be an object or null" },
        { status: 400 },
      )
    }
    updateData.templateData =
      td === null ? null : (td as Prisma.InputJsonValue)
  }

  const updated = await prisma.ticket.update({
    where: { id },
    data: updateData as Prisma.TicketUncheckedUpdateInput,
    include: {
      subDepartment:    { select: { prefix: true, name: true } },
      assignee:{ select: { id: true, name: true, email: true } },
      project: { select: { id: true, name: true } },
      sprint:  { select: { id: true, name: true } },
      module:  { select: { id: true, name: true } },
    },
  })

  // Keep project membership in sync with assignment / project moves.
  if (hasAssignee && newAssigneeId) {
    await ensureProjectMembers(updated.projectId, [newAssigneeId])
  }
  if (hasProjectId && updateData.projectId && updateData.projectId !== ticket.projectId) {
    await ensureProjectMembers(updateData.projectId as string, [
      updated.assigneeId,
      ...ticket.assignees.map((a) => a.userId),
    ])
  }

  // ── Event sourcing: emit one event per changed field ─────────────────────────
  // All events are written and broadcast concurrently; none block the response.
  const events: Promise<void>[] = []

  if (hasTitle && updateData.title !== ticket.title) {
    events.push(appendTicketEvent(id, profile.id, "TITLE_CHANGED", {
      from: ticket.title,
      to: updateData.title!,
    }))
  }

  if (hasPriority && updateData.priority !== ticket.priority) {
    events.push(appendTicketEvent(id, profile.id, "PRIORITY_CHANGED", {
      from: ticket.priority,
      to: updateData.priority!,
    }))
  }

  if (hasDescription && updateData.description !== ticket.description) {
    events.push(appendTicketEvent(id, profile.id, "DESCRIPTION_CHANGED", {
      hadDescription: !!ticket.description,
      to: (updateData.description as string | null | undefined) ?? null,
    }))
  }

  if (hasStoryPoints && updateData.storyPoints !== ticket.storyPoints) {
    events.push(appendTicketEvent(id, profile.id, "STORY_POINTS_CHANGED", {
      from: ticket.storyPoints ?? null,
      to:   updateData.storyPoints ?? null,
    }))
  }

  if (hasEstimatedTime && updateData.estimatedTime !== ticket.estimatedTime) {
    events.push(appendTicketEvent(id, profile.id, "ESTIMATED_TIME_CHANGED", {
      from: ticket.estimatedTime ?? null,
      to:   updateData.estimatedTime ?? null,
    }))
  }

  const fmtDate = (d: Date | null | undefined, role: "start" | "due" = "start") => {
    if (!d) return null
    const day = formatCalendarDate(d)
    // Preserve explicit end times so other clients can show them in the picker
    if (role === "due" && dueHasTime(d)) return `${day}T${formatTimeHM(d)}`
    return day
  }
  const dateChanged =
    (hasStartDate && String(updateData.startDate ?? null) !== String(ticket.startDate ?? null)) ||
    (hasDueDate   && String(updateData.dueDate   ?? null) !== String(ticket.dueDate   ?? null))
  if (dateChanged) {
    events.push(appendTicketEvent(id, profile.id, "DATE_CHANGED", {
      fromStart: fmtDate(ticket.startDate, "start"),
      fromEnd:   fmtDate(ticket.dueDate, "due"),
      toStart:   fmtDate(updateData.startDate as Date | null | undefined, "start"),
      toEnd:     fmtDate(updateData.dueDate   as Date | null | undefined, "due"),
    }))
  }

  if (hasSprintId && updateData.sprintId !== ticket.sprintId) {
    events.push(appendTicketEvent(id, profile.id, "SPRINT_CHANGED", {
      fromId:   ticket.sprint?.id   ?? null,
      fromName: ticket.sprint?.name ?? null,
      toId:     updated.sprint?.id   ?? null,
      toName:   updated.sprint?.name ?? null,
    }))
  }

  if (hasProjectId && updateData.projectId !== ticket.projectId) {
    events.push(appendTicketEvent(id, profile.id, "PROJECT_CHANGED", {
      fromId:   ticket.project?.id   ?? null,
      fromName: ticket.project?.name ?? null,
      toId:     updated.project?.id   ?? null,
      toName:   updated.project?.name ?? null,
    }))
  }

  const effectiveModuleId = hasModuleId ? updateData.moduleId : (hasProjectId && updateData.projectId !== ticket.projectId ? null : undefined)
  if (effectiveModuleId !== undefined && effectiveModuleId !== ticket.moduleId) {
    events.push(appendTicketEvent(id, profile.id, "MODULE_CHANGED", {
      fromId:   ticket.module?.id   ?? null,
      fromName: ticket.module?.name ?? null,
      toId:     updated.module?.id   ?? null,
      toName:   updated.module?.name ?? null,
    }))
  }

  if (updateData.labels !== undefined) {
    const oldSet = new Set(ticket.labels ?? [])
    const newSet = new Set(updateData.labels ?? [])
    const added   = [...newSet].filter((l) => !oldSet.has(l))
    const removed = [...oldSet].filter((l) => !newSet.has(l))
    if (added.length > 0 || removed.length > 0) {
      events.push(appendTicketEvent(id, profile.id, "LABELS_CHANGED", { added, removed }))
    }
  }

  if (hasAssignee && newAssigneeId !== prevAssigneeId) {
    events.push(appendTicketEvent(id, profile.id, "ASSIGNED", {
      fromId:   prevAssigneeId,
      fromName: ticket.assignee?.name ?? null,
      toId:     newAssigneeId ?? null,
      toName:   updated.assignee?.name ?? null,
    }))

    if (updated.assignee && !ticket.isDraft && !publishing) {
      // Notifications/emails after response — don't block field edits
      after(() => {
        void createNotification({
          recipientId: updated.assignee!.id,
          actorId: profile.id,
          type: "assignment",
          ticketId: id,
          message: ticket.title,
        })
        const humanId = `${updated.subDepartment.prefix}-${ticket.ticketNumber}`
        sendAssignmentEmail({
          to: updated.assignee!.email,
          assigneeName: updated.assignee!.name,
          assigneeId: updated.assignee!.id,
          ticketId: id,
          humanId,
          ticketTitle: ticket.title,
          assignedByName: profile.name,
          assignedById: profile.id,
          departmentId: ticket.subDepartment.departmentId,
          subDepartmentId: ticket.subDepartmentId,
        }).catch((err) => console.error("[assignment email] failed:", err))
      })
    }
  }

  if (publishing) {
    events.push(appendTicketEvent(id, profile.id, "TICKET_CREATED", {
      humanId: `${updated.subDepartment.prefix}-${ticket.ticketNumber}`,
      title: updated.title,
      status: updated.status,
    }))

    after(async () => {
      const humanId = `${updated.subDepartment.prefix}-${ticket.ticketNumber}`
      const primary = updated.assignee
      if (primary && primary.id !== profile.id) {
        await createNotification({
          recipientId: primary.id,
          actorId: profile.id,
          type: "assignment",
          ticketId: id,
          message: updated.title,
        })
        sendAssignmentEmail({
          to: primary.email,
          assigneeName: primary.name,
          assigneeId: primary.id,
          ticketId: id,
          humanId,
          ticketTitle: updated.title,
          assignedByName: profile.name,
          assignedById: profile.id,
          departmentId: ticket.subDepartment.departmentId,
          subDepartmentId: ticket.subDepartmentId,
        }).catch((err) => console.error("[assignment email] failed:", err))
      }

      const coAssignees = await prisma.ticketAssignee.findMany({
        where: { ticketId: id },
        include: { user: { select: { id: true, name: true, email: true } } },
      })
      for (const row of coAssignees) {
        if (row.userId === profile.id) continue
        if (primary && row.userId === primary.id) continue
        await createNotification({
          recipientId: row.userId,
          actorId: profile.id,
          type: "assignment",
          ticketId: id,
          message: updated.title,
        })
        sendAssignmentEmail({
          to: row.user.email,
          assigneeName: row.user.name,
          assigneeId: row.user.id,
          ticketId: id,
          humanId,
          ticketTitle: updated.title,
          assignedByName: profile.name,
          assignedById: profile.id,
          departmentId: ticket.subDepartment.departmentId,
          subDepartmentId: ticket.subDepartmentId,
        }).catch((err) => console.error("[assignment email] failed:", err))
      }
    })
  }

  // Record the link on the new parent's activity feed, mirroring the
  // create-sub-ticket flow so linked and created sub-tickets look alike.
  if (hasParentId && updateData.parentId && updateData.parentId !== ticket.parentId) {
    events.push(appendTicketEvent(updateData.parentId, profile.id, "SUBTICKET_ADDED", {
      humanId: `${ticket.subDepartment.prefix}-${ticket.ticketNumber}`,
      title: ticket.title,
      subTicketId: id,
    }))
  }

  // Broadcast + ActivityLog off the request path so priority/labels/dates feel instant
  after(() => {
    void Promise.all(events)
  })

  if (hasStatus && updateData.closedAt) {
    cascadeCompleteToSubtickets(id).catch(() => undefined)
  }

  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      ticketNumber: true,
      tenantId: true,
      subDepartmentId: true,
      projectId: true,
      assigneeId: true,
      creatorId: true,
      deletedAt: true,
      subDepartment: { select: { departmentId: true, prefix: true } },
      assignees: { select: { userId: true } },
    },
  })
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Not forWrite: a soft-deleted ticket should not 409 here — deletion is
  // idempotent below, so a repeated/racing request resolves cleanly.
  const accessError = await assertTicketAccess(profile, ticket)
  if (accessError) return accessError

  if (!canDeleteTicket(profile, { creatorId: ticket.creatorId })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Already deleted (e.g. a double-submit) — succeed idempotently.
  if (ticket.deletedAt) return NextResponse.json({ ok: true })

  const humanId = `${ticket.subDepartment.prefix}-${ticket.ticketNumber}`

  // Soft-delete is the only critical write. Keeping it outside a transaction
  // avoids P2028 (couldn't acquire a connection to start the tx) under pool
  // pressure; the activity log below is best-effort, like the notifications.
  await prisma.ticket.update({ where: { id }, data: { deletedAt: new Date() } })

  const recipients = [
    ...(ticket.assigneeId ? [ticket.assigneeId] : []),
    ...ticket.assignees.map((a) => a.userId),
  ].filter((uid, i, arr) => uid !== profile.id && arr.indexOf(uid) === i)

  // Respond immediately — soft-delete fires a Ticket UPDATE on realtime, which
  // debounces into router.refresh() on the board. Returning before that refresh
  // can abort the in-flight DELETE fetch and falsely report failure.
  after(() => {
    prisma.activityLog.create({
      data: {
        ticketId: id,
        actorId: profile.id,
        action: "TICKET_DELETED",
        metadata: { humanId, title: ticket.title },
      },
    }).catch(() => undefined)
    for (const recipientId of recipients) {
      createNotification({
        recipientId,
        actorId: profile.id,
        type: "ticket_deleted",
        ticketId: id,
        message: humanId,
      }).catch(() => undefined)
    }
  })

  return NextResponse.json({ ok: true })
}
