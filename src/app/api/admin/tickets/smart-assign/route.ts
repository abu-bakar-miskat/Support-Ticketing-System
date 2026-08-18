import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager } from "@/lib/auth"
import { getProfileDeptScope } from "@/lib/dept-scope"
import { isMemberActiveInRotation } from "@/lib/rota"
import { createNotification } from "@/lib/notify"
import { sendAssignmentEmail } from "@/lib/email"
import { ensureProjectMembers } from "@/lib/ensure-project-members"

export async function POST(req: NextRequest) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const body = await req.json()
  const { ticketIds, mode } = body as {
    ticketIds: string[]
    mode: "single" | "round-robin"
    assigneeIds: string[]
  }
  let { assigneeIds } = body as { assigneeIds: string[] }

  if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
    return NextResponse.json({ error: "ticketIds must be a non-empty array" }, { status: 400 })
  }
  if (mode !== "single" && mode !== "round-robin") {
    return NextResponse.json({ error: "mode must be 'single' or 'round-robin'" }, { status: 400 })
  }
  if (!Array.isArray(assigneeIds) || assigneeIds.length === 0) {
    return NextResponse.json({ error: "assigneeIds must be a non-empty array" }, { status: 400 })
  }

  // Verify all assignees exist
  const assignees = await prisma.profile.findMany({
    where: { id: { in: assigneeIds }, deletedAt: null },
    select: { id: true, role: true },
  })
  if (assignees.length !== assigneeIds.length) {
    return NextResponse.json({ error: "One or more assignees not found" }, { status: 404 })
  }

  // Round-robin must never land on a manager — they don't work tickets.
  if (mode === "round-robin") {
    const managerIds = new Set(assignees.filter((a) => a.role === "manager").map((a) => a.id))
    if (managerIds.size > 0) {
      assigneeIds = assigneeIds.filter((id) => !managerIds.has(id))
      if (assigneeIds.length === 0) {
        return NextResponse.json(
          { error: "No eligible (non-manager) assignees to round robin across" },
          { status: 400 },
        )
      }
    }
  }

  // Managers: scope check — only tickets within their department
  if (caller!.role === "manager") {
    const deptScope = await getProfileDeptScope(caller!)
    const subDepartmentIds = deptScope?.subDepartmentIds ?? []
    if (subDepartmentIds.length > 0) {
      const outOfScope = await prisma.ticket.findFirst({
        where: { id: { in: ticketIds }, subDepartmentId: { notIn: subDepartmentIds } },
        select: { id: true },
      })
      if (outOfScope) {
        return NextResponse.json(
          { error: "One or more tickets are outside your department scope" },
          { status: 403 },
        )
      }
    }
  }

  // Previous state — needed to know which tickets actually change assignee (for
  // notifications/email) and to build the human-readable ticket ID (TEAM-123).
  const ticketsBefore = await prisma.ticket.findMany({
    where: { id: { in: ticketIds }, deletedAt: null },
    select: {
      id: true,
      title: true,
      ticketNumber: true,
      assigneeId: true,
      projectId: true,
      subDepartment: { select: { prefix: true, departmentId: true } },
    },
  })
  const ticketById = new Map(ticketsBefore.map((t) => [t.id, t]))

  let assignments: { ticketId: string; assigneeId: string }[]
  let assigneesUsed: string[]

  if (mode === "single") {
    assignments = ticketIds.map((id) => ({ ticketId: id, assigneeId: assigneeIds[0] }))
    assigneesUsed = [assigneeIds[0]]

    await prisma.ticket.updateMany({
      where: { id: { in: ticketIds }, deletedAt: null },
      data: { assigneeId: assigneeIds[0] },
    })
  } else {
    // Round robin — filter out members not "active in rotation" (profile isActive=false or team doNotAssign), fall back to
    // all if that leaves nobody. Deliberately NOT using isMemberAvailableNow here: this is a
    // manual bulk action over an explicitly chosen set of members, so filtering by real-time
    // working hours/holiday would shrink the candidate pool (sometimes to just 1 person) and
    // break the round-robin distribution across the tickets.
    const firstTicket = await prisma.ticket.findUnique({
      where: { id: ticketIds[0] },
      select: { subDepartmentId: true },
    })
    const subDepartmentId = firstTicket?.subDepartmentId ?? null

    let effectiveIds = assigneeIds
    if (subDepartmentId) {
      const flags = await Promise.all(assigneeIds.map((id) => isMemberActiveInRotation(id, subDepartmentId)))
      const active = assigneeIds.filter((_, i) => flags[i])
      if (active.length > 0) effectiveIds = active
      // else: all members inactive in rotation — fall back to full list so no ticket is left unassigned
    }

    // Assign ticket[i] → effectiveIds[i % effectiveIds.length]
    assignments = ticketIds.map((id, i) => ({
      ticketId: id,
      assigneeId: effectiveIds[i % effectiveIds.length],
    }))
    assigneesUsed = effectiveIds

    await prisma.$transaction(
      assignments.map(({ ticketId, assigneeId }) =>
        prisma.ticket.update({ where: { id: ticketId }, data: { assigneeId } }),
      ),
    )
  }

  // Auto-add assignees to each ticket's project
  const membersByProject = new Map<string, Set<string>>()
  for (const { ticketId, assigneeId } of assignments) {
    const projectId = ticketById.get(ticketId)?.projectId
    if (!projectId) continue
    const set = membersByProject.get(projectId) ?? new Set<string>()
    set.add(assigneeId)
    membersByProject.set(projectId, set)
  }
  await Promise.all(
    [...membersByProject.entries()].map(([projectId, userIds]) =>
      ensureProjectMembers(projectId, [...userIds]),
    ),
  )

  // Notify only tickets whose assignee actually changed — mirrors the single-ticket
  // assign flow (ActivityLog + in-app notification + assignment email).
  const changed = assignments.filter(
    ({ ticketId, assigneeId }) => ticketById.get(ticketId)?.assigneeId !== assigneeId,
  )
  if (changed.length > 0) {
    const assigneeProfiles = await prisma.profile.findMany({
      where: { id: { in: [...new Set(changed.map((c) => c.assigneeId))] } },
      select: { id: true, name: true, email: true },
    })
    const profileById = new Map(assigneeProfiles.map((p) => [p.id, p]))

    await Promise.all(
      changed.map(async ({ ticketId, assigneeId }) => {
        const before = ticketById.get(ticketId)
        const assignee = profileById.get(assigneeId)
        if (!before || !assignee) return

        await prisma.activityLog.create({
          data: {
            ticketId,
            actorId: caller!.id,
            action: "ASSIGNED",
            metadata: {
              fromName: null,
              fromId: before.assigneeId,
              toName: assignee.name,
              toId: assignee.id,
            },
          },
        })

        await createNotification({
          recipientId: assignee.id,
          actorId: caller!.id,
          type: "assignment",
          ticketId,
          message: before.title,
        })

        const humanId = `${before.subDepartment.prefix}-${before.ticketNumber}`
        sendAssignmentEmail({
          to: assignee.email,
          assigneeName: assignee.name,
          assigneeId: assignee.id,
          ticketId,
          humanId,
          ticketTitle: before.title,
          assignedByName: caller!.name,
          assignedById: caller!.id,
          departmentId: before.subDepartment.departmentId,
        }).catch((err) => console.error("[assignment email] failed:", err))
      }),
    )
  }

  return NextResponse.json({ updated: ticketIds.length, assigneesUsed: assigneesUsed.length })
}
