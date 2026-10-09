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

const SELECT = { mailboxFirstResponseMins: true, mailboxResolutionMins: true } as const

function toBody(dept: { mailboxFirstResponseMins: number | null; mailboxResolutionMins: number | null }) {
  return {
    firstResponseMins: dept.mailboxFirstResponseMins,
    resolutionMins: dept.mailboxResolutionMins,
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
 * both positive minutes, or both null to turn the mailbox SLA off. Applies to
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

  const exists = await prisma.department.findUnique({ where: { id }, select: { id: true } })
  if (!exists) return NextResponse.json({ error: "Department not found" }, { status: 404 })

  const updated = await prisma.department.update({
    where: { id },
    data: { mailboxFirstResponseMins: first, mailboxResolutionMins: resolution },
    select: SELECT,
  })
  return NextResponse.json({ ...toBody(updated), canEdit: true })
}
