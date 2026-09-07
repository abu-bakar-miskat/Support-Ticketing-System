import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { Role } from "@/generated/prisma/enums"
import { managerCanManageUser, subDepartmentInScope } from "@/lib/dept-scope"
import { recordAuditEvent } from "@/lib/audit-log"
import { broadcastForceLogout } from "@/lib/realtime-broadcast"
import {
  buildRoleChangeActor,
  changeRoles,
  expectedBeforeForChanges,
  loadUserRoleChanges,
  planLegacyDepartmentRoleUpdate,
  roleChangeHttpStatus,
  RoleChangeError,
  type RoleChange,
} from "@/lib/role-management"

const VALID_ROLES = Object.values(Role)
// Managers can only assign these roles — not admin or manager
const MANAGER_ALLOWED_ROLES: Role[] = ["sub_manager", "agent"]

async function resolveRoleChangeDepartmentId(
  userId: string,
  tenantId: string | null | undefined,
  bodyDepartmentId?: string | null,
): Promise<string | null> {
  if (typeof bodyDepartmentId === "string" && bodyDepartmentId.length > 0) return bodyDepartmentId
  if (!tenantId) return null
  const [manager, subDepartmentMembership] = await Promise.all([
    prisma.departmentManager.findFirst({
      where: { userId, department: { tenantId } },
      select: { departmentId: true },
    }),
    prisma.subDepartmentMembership.findFirst({
      where: { userId, isActive: true, subDepartment: { tenantId } },
      select: { subDepartment: { select: { departmentId: true } } },
    }),
  ])
  return manager?.departmentId ?? subDepartmentMembership?.subDepartment.departmentId ?? null
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const isAdmin = profile!.role === "admin"
  const isManager = profile!.role === "manager"
  if (!isAdmin && !isManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()

  if (isManager && !(await managerCanManageUser(profile!, id))) {
    return NextResponse.json({ error: "User is outside your department scope" }, { status: 403 })
  }

  const data: {
    subDepartmentId?: string | null
    location?: string | null
    timezone?: string | null
    isActive?: boolean
  } = {}

  let scopedRoleChanges: RoleChange[] | undefined
  let scopedRoleExpectedBefore: RoleChange[] | undefined

  if ("location" in body) {
    data.location = body.location ? String(body.location).trim() : null
  }

  if ("timezone" in body) {
    data.timezone = body.timezone ? String(body.timezone).trim() : null
  }

  if ("isActive" in body) {
    data.isActive = Boolean(body.isActive)
  }

  if ("role" in body || "roleChanges" in body) {
    if ("roleChanges" in body && Array.isArray(body.roleChanges)) {
      scopedRoleChanges = body.roleChanges as RoleChange[]
      scopedRoleExpectedBefore = Array.isArray(body.expectedBefore) ? (body.expectedBefore as RoleChange[]) : []
    } else if ("role" in body) {
      if (!VALID_ROLES.includes(body.role)) {
        return NextResponse.json(
          { error: `role must be one of: ${VALID_ROLES.join(", ")}` },
          { status: 400 },
        )
      }
      if (isManager && !MANAGER_ALLOWED_ROLES.includes(body.role)) {
        return NextResponse.json(
          { error: "Managers can only assign sub-manager or agent roles" },
          { status: 403 },
        )
      }
      const departmentId = await resolveRoleChangeDepartmentId(
        id,
        profile!.activeTenantId,
        typeof body.departmentId === "string" ? body.departmentId : null,
      )
      if (!departmentId) {
        return NextResponse.json(
          { error: "departmentId is required for scoped role changes" },
          { status: 400 },
        )
      }
      const subDepartmentId =
        typeof body.subDepartmentId === "string"
          ? body.subDepartmentId
          : (
              await prisma.profile.findUnique({
                where: { id },
                select: { subDepartmentId: true },
              })
            )?.subDepartmentId ?? null
      try {
        const current = await loadUserRoleChanges(id, profile!.activeTenantId ?? undefined)
        scopedRoleChanges = planLegacyDepartmentRoleUpdate({
          departmentId,
          subDepartmentId,
          newRole: body.role as Role,
          current,
        })
        scopedRoleExpectedBefore = await expectedBeforeForChanges(id, scopedRoleChanges)
      } catch (err) {
        if (err instanceof RoleChangeError) {
          return NextResponse.json({ error: err.message }, { status: roleChangeHttpStatus(err) })
        }
        throw err
      }
    }
  }

  if ("role" in body && !("roleChanges" in body) && !scopedRoleChanges) {
    return NextResponse.json({ error: "Could not resolve scoped role changes" }, { status: 400 })
  }

  if ("role" in body && "roleChanges" in body) {
    return NextResponse.json({ error: "Send either role or roleChanges, not both" }, { status: 400 })
  }

  if ("subDepartmentId" in body) {
    const nextSubDepartmentId = body.subDepartmentId ?? null
    if (isManager && nextSubDepartmentId && !(await subDepartmentInScope(profile!, nextSubDepartmentId))) {
      return NextResponse.json({ error: "SubDepartment is outside your department scope" }, { status: 403 })
    }
    data.subDepartmentId = nextSubDepartmentId
  }

  // Move a member to a different department (tenant-wide Members view). This is a
  // department-level move: the user lands as a direct department member with no
  // sub-department, and their memberships in other departments are cleared. The
  // caller then picks a sub-department (via subDepartmentId) to place them inside.
  let moveToDepartmentId: string | null | undefined
  if ("departmentId" in body && !("subDepartmentId" in body) && !("role" in body) && !("roleChanges" in body)) {
    moveToDepartmentId = body.departmentId ?? null
    if (moveToDepartmentId) {
      const dept = await prisma.department.findUnique({
        where: { id: moveToDepartmentId },
        select: { id: true, tenantId: true },
      })
      if (!dept || (profile!.activeTenantId && dept.tenantId !== profile!.activeTenantId)) {
        return NextResponse.json({ error: "Department not found" }, { status: 404 })
      }
      // Managers may only move users into departments they manage.
      if (isManager && !(profile!.managedDepartmentIds ?? []).includes(moveToDepartmentId)) {
        return NextResponse.json({ error: "Department is outside your scope" }, { status: 403 })
      }
    }
    // Landing at department level means no sub-department yet.
    data.subDepartmentId = null
  }

  if (Object.keys(data).length === 0 && moveToDepartmentId === undefined && !scopedRoleChanges) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 })
  }

  const profileBefore = Object.keys(data).length > 0
    ? await prisma.profile.findUnique({
        where: { id },
        select: { subDepartmentId: true, location: true, timezone: true, isActive: true },
      })
    : null

  if (scopedRoleChanges) {
    try {
      await changeRoles({
        userId: id,
        actor: buildRoleChangeActor(profile!),
        changes: scopedRoleChanges,
        expectedBefore: scopedRoleExpectedBefore ?? [],
      })
    } catch (err) {
      if (err instanceof RoleChangeError) {
        return NextResponse.json({ error: err.message }, { status: roleChangeHttpStatus(err) })
      }
      throw err
    }
  }

  const updatedProfile = Object.keys(data).length > 0
    ? await prisma.profile.update({ where: { id }, data })
    : await prisma.profile.findUniqueOrThrow({ where: { id } })

  // NFR-09/DAT-05 (slice 20): user changes are audited with actor + before/after
  // state. Role mutations are audited inside changeRoles; profile metadata here.
  if (profile!.activeTenantId && Object.keys(data).length > 0) {
    await recordAuditEvent({
      tenantId: profile!.activeTenantId,
      actorId: profile!.id,
      action: "USER_UPDATED",
      targetType: "Profile",
      targetId: id,
      before: profileBefore,
      after: data,
    })
  }

  // SA-03: an individual user restriction (isActive: false) needs the same
  // "invalidated within 60s" guarantee as a tenant suspension — getProfile()
  // already blocks their next request, this covers an already-open tab.
  if (data.isActive === false && profileBefore?.isActive !== false) {
    await broadcastForceLogout([id], "Your account has been restricted. Contact your administrator for access.")
  }

  // Department-level move: clear memberships outside the target department.
  // People join via sub-departments only — no DepartmentMember rows are created.
  if (moveToDepartmentId !== undefined) {
    await prisma.$transaction([
      // Deactivate sub-department memberships that belong to a different department.
      prisma.subDepartmentMembership.updateMany({
        where: {
          userId: id,
          isActive: true,
          ...(moveToDepartmentId
            ? { subDepartment: { departmentId: { not: moveToDepartmentId } } }
            : {}),
        },
        data: { isActive: false },
      }),
      // Drop legacy direct department memberships.
      prisma.departmentMember.deleteMany({
        where: { userId: id },
      }),
    ])
  }

  // Keep SubDepartmentMembership in sync with Profile.teamId. The department members list is
  // built from active SubDepartmentMembership rows, so a teamId change must move the user's
  // membership too — otherwise the change appears to save but never shows up.
  if ("subDepartmentId" in data) {
    const nextSubDepartmentId = data.subDepartmentId ?? null
    if (nextSubDepartmentId) {
      const subDepartment = await prisma.subDepartment.findUnique({
        where: { id: nextSubDepartmentId },
        select: { departmentId: true },
      })
      if (subDepartment) {
        await prisma.$transaction([
          // Deactivate the user's other active memberships in the same department
          // so this is a move (single-team dropdown), not an additive assignment.
          (prisma.subDepartmentMembership as any).updateMany({
            where: {
              userId: id,
              isActive: true,
              subDepartmentId: { not: nextSubDepartmentId },
              subDepartment: { departmentId: subDepartment.departmentId },
            },
            data: { isActive: false },
          }),
          (prisma.subDepartmentMembership as any).upsert({
            where: { userId_subDepartmentId: { userId: id, subDepartmentId: nextSubDepartmentId } },
            create: { userId: id, subDepartmentId: nextSubDepartmentId, role: "agent", isActive: true },
            update: { isActive: true },
          }),
        ])
      }
    }
  }

  return NextResponse.json(updatedProfile)
}

// DELETE — admin hard-removes a user's footprints and soft-deletes their profile.
// Tickets/comments authored by the user are preserved but point to the deactivated profile.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  if (profile!.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  if (id === profile!.id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 })
  }

  const target = await prisma.profile.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  })
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 })
  if (target.deletedAt) return NextResponse.json({ error: "User already deleted" }, { status: 409 })

  // Pre-fetch pending join requests + their notification recipients BEFORE the
  // transaction wipes them — needed to broadcast resolutions afterwards.
  const pendingJoinRequests = await prisma.joinRequest.findMany({
    where: { userId: id, status: "pending" },
    select: {
      id: true,
      notifications: {
        select: { recipientId: true },
        distinct: ["recipientId"],
      },
    },
  })

  // Cascade-delete all user footprints, then soft-delete the profile.
  // Profile is soft-deleted (not hard-deleted) so that non-nullable FK references
  // on Ticket.creatorId, Comment.authorId, and Attachment.uploaderProfileId remain intact.
  await prisma.$transaction([
    // ── Membership & access ──────────────────────────────────────────────────
    (prisma.subDepartmentMembership as any).deleteMany({ where: { userId: id } }),
    prisma.departmentManager.deleteMany({ where: { userId: id } }),
    prisma.departmentMember.deleteMany({ where: { userId: id } }),
    prisma.departmentAccess.deleteMany({ where: { userId: id } }),
    (prisma.projectMember as any).deleteMany({ where: { userId: id } }),
    (prisma.ticketAssignee as any).deleteMany({ where: { userId: id } }),
    // ── Ticket assignment ────────────────────────────────────────────────────
    // Null-out primary assignee on open tickets so they can be re-assigned
    prisma.ticket.updateMany({
      where: { assigneeId: id },
      data: { assigneeId: null },
    }),
    // ── Personal workspace data ──────────────────────────────────────────────
    prisma.timeEntry.deleteMany({ where: { profileId: id } }),
    prisma.apiKey.deleteMany({ where: { createdById: id } }),
    // ── Notifications & activity ─────────────────────────────────────────────
    prisma.activityLog.deleteMany({ where: { actorId: id } }),
    prisma.notification.deleteMany({
      where: { OR: [{ recipientId: id }, { actorId: id }] },
    }),
    prisma.mention.deleteMany({ where: { mentionedUserId: id } }),
    prisma.pushSubscription.deleteMany({ where: { userId: id } }),
    // ── Join requests ────────────────────────────────────────────────────────
    prisma.joinRequest.deleteMany({ where: { userId: id } }),
    // ── Soft-delete the profile ──────────────────────────────────────────────
    prisma.profile.update({
      where: { id },
      data: { deletedAt: new Date(), subDepartmentId: null },
    }),
  ])

  // NFR-09/DAT-05 (slice 20): user removal is audited.
  if (profile!.activeTenantId) {
    await recordAuditEvent({
      tenantId: profile!.activeTenantId,
      actorId: profile!.id,
      action: "USER_DELETED",
      targetType: "Profile",
      targetId: id,
      before: { deletedAt: null },
      after: { deletedAt: new Date().toISOString() },
    })
  }

  // Broadcast join_request_resolved for every pending request that was deleted,
  // so other admins' JoinRequestsSection removes the row in real time.
  if (pendingJoinRequests.length > 0) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (supabaseUrl && serviceKey) {
      const messages = pendingJoinRequests.flatMap((jr) =>
        jr.notifications
          .map((n) => n.recipientId)
          .filter((rid) => rid !== profile!.id)
          .map((recipientId) => ({
            topic: `user-notifs:${recipientId}`,
            event: "join_request_resolved",
            payload: { requestId: jr.id, status: "rejected" },
            private: false,
          })),
      )
      if (messages.length > 0) {
        await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ messages }),
        }).catch(() => undefined)
      }
    }
  }

  // Keep the Supabase auth user so soft-deleted profiles can sign in again.

  return NextResponse.json({ ok: true })
}
