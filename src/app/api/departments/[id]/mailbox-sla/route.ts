import { isCompleteStatus, type StatusCategory } from "@/lib/status-category"
import { isMailboxActiveStatus } from "@/lib/mailbox-sla"
import { DEFAULT_STATUSES } from "@/components/board/board-types"
import type { Prisma } from "@/generated/prisma/client"
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { canAdminDeptSettings, departmentIdInScope, type ProfileLike } from "@/lib/dept-scope"

// One year — anything longer is almost certainly a typo.
const MAX_MINS = 365 * 24 * 60

/**
 * Shared-mailbox SLA targets are set by the department's managers as well as
 * admins (unlike form SLA policies, which stay admin-only).
 */
function canEditMailboxSla(profile: ProfileLike, departmentId: string): boolean {
  return canAdminDeptSettings(profile, departmentId) || (profile.managedDepartmentIds ?? []).includes(departmentId)
}

const SELECT = {
  tenantId: true, slaConfig: true, mailboxFirstResponseMins: true, mailboxResolutionMins: true,
  subDepartments: { select: { statuses: { select: { label: true, category: true }, orderBy: { order: "asc" as const } } } },
  mailboxConnections: { select: { id: true, address: true, slaFirstResponseMins: true, slaResolutionMins: true } },
} as const

function availableStatuses(dept: { subDepartments?: { statuses: { label: string; category: StatusCategory }[] }[] }) {
  const workflows = dept.subDepartments?.length ? dept.subDepartments.map((sub) => sub.statuses.length ? sub.statuses : DEFAULT_STATUSES) : [DEFAULT_STATUSES]
  return [...new Set(workflows.flat().filter((status) => !isCompleteStatus(status)).map((status) => status.label))]
}

function toBody(dept: { mailboxFirstResponseMins: number | null; mailboxResolutionMins: number | null; slaConfig?: unknown; subDepartments?: { statuses: { label: string; category: StatusCategory }[] }[]; mailboxConnections?: { id: string; address: string; slaFirstResponseMins: number | null; slaResolutionMins: number | null }[] }) {
  return {
    availableStatuses: availableStatuses(dept),
    firstResponseMins: dept.mailboxFirstResponseMins,
    resolutionMins: dept.mailboxResolutionMins,
    activeStatuses: ((dept.slaConfig as { mailboxActiveStatuses?: string[] } | null)?.mailboxActiveStatuses ?? ["In Progress"]).map((status) => availableStatuses(dept).find((label) => isMailboxActiveStatus(label, [status])) ?? status),
    mailboxes: (dept.mailboxConnections ?? []).map((mailbox) => ({
      id: mailbox.id, address: mailbox.address,
      firstResponseMins: mailbox.slaFirstResponseMins, resolutionMins: mailbox.slaResolutionMins,
    })),
  }
}

/** GET /api/departments/:id/mailbox-sla — the department's shared-mailbox SLA targets. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  if (!(await departmentIdInScope(profile, id)) && !canEditMailboxSla(profile, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const department = await prisma.department.findUnique({ where: { id }, select: SELECT })
  if (!department) return NextResponse.json({ error: "Department not found" }, { status: 404 })

  return NextResponse.json({ ...toBody(department), canEdit: canEditMailboxSla(profile, id) })
}

/**
 * PATCH /api/departments/:id/mailbox-sla — `{ firstResponseMins, resolutionMins }`,
 * both positive minutes, or both null to turn off department defaults. mailboxConnectionId optionally selects
 * a per-mailbox override instead (null pair inherits department targets). Applies to
 * mailbox tickets created from now on; existing timers keep their targets.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  if (!canEditMailboxSla(profile, id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const first = body.firstResponseMins ?? null
  const resolution = body.resolutionMins ?? null

  const valid = (v: unknown) => Number.isInteger(v) && (v as number) > 0 && (v as number) <= MAX_MINS
  const bothOff = first === null && resolution === null
  if (!bothOff && !(valid(first) && valid(resolution))) {
    return NextResponse.json(
      { error: "Set both Time to first response and Time to resolution (whole minutes, greater than 0), or clear both." },
      { status: 400 },
    )
  }

  const exists = await prisma.department.findUnique({ where: { id }, select: { id: true, slaConfig: true, subDepartments: SELECT.subDepartments } })
  if (!exists) return NextResponse.json({ error: "Department not found" }, { status: 404 })

  if (body.mailboxConnectionId !== undefined) {
    if (typeof body.mailboxConnectionId !== "string") return NextResponse.json({ error: "Invalid mailbox" }, { status: 400 })
    const mailbox = await prisma.mailboxConnection.findFirst({
      where: { id: body.mailboxConnectionId, departmentId: id }, select: { id: true },
    })
    if (!mailbox) return NextResponse.json({ error: "Mailbox not found in department" }, { status: 404 })
    await prisma.mailboxConnection.update({
      where: { id: mailbox.id }, data: { slaFirstResponseMins: first, slaResolutionMins: resolution },
    })
    const department = await prisma.department.findUnique({ where: { id }, select: SELECT })
    return NextResponse.json({ ...toBody(department!), canEdit: true })
  }
  const activeStatuses = body.activeStatuses
  if (activeStatuses !== undefined && (!Array.isArray(activeStatuses) || activeStatuses.length === 0 || activeStatuses.length > 20 || activeStatuses.some((status: unknown) => typeof status !== "string" || !status.trim() || status.length > 100))) {
    return NextResponse.json({ error: "Provide at least one active status name" }, { status: 400 })
  }
  if (activeStatuses !== undefined && activeStatuses.some((status: string) => !availableStatuses(exists).includes(status.trim()))) {
    return NextResponse.json({ error: "Select active statuses from this department's workflows" }, { status: 400 })
  }
  const currentConfig = exists.slaConfig && typeof exists.slaConfig === "object" && !Array.isArray(exists.slaConfig) ? exists.slaConfig : {}
  const updated = await prisma.department.update({
    where: { id },
    data: {
      mailboxFirstResponseMins: first, mailboxResolutionMins: resolution,
      ...(activeStatuses === undefined ? {} : { slaConfig: { ...currentConfig, mailboxActiveStatuses: [...new Set(activeStatuses.map((status: string) => status.trim()))] } as Prisma.InputJsonValue }),
    },
    select: SELECT,
  })
  return NextResponse.json({ ...toBody(updated), canEdit: true })
}
