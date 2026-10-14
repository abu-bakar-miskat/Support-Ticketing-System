import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import type { AuthProfile } from "@/lib/auth"
import { Role } from "@/generated/prisma/enums"

/**
 * Tenant isolation: a non-super-admin may only manage a target user who belongs
 * to the caller's active tenant. Returns 404 (not 403) to avoid disclosing that a
 * user exists in another tenant. Super-admins transcend tenant scope. Note we do
 * NOT filter on membership.isActive so an admin can still reactivate a
 * deactivated member of their tenant.
 */
async function assertTargetInCallerTenant(caller: AuthProfile, targetUserId: string): Promise<NextResponse | null> {
  if (caller.isSuperAdmin) return null
  const tenantId = caller.activeTenantId
  if (!tenantId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const membership = await prisma.tenantMembership.findFirst({
    where: { userId: targetUserId, tenantId },
    select: { userId: true },
  })
  if (!membership) return NextResponse.json({ error: "User not found" }, { status: 404 })
  return null
}
import { managerCanManageUser, subDepartmentInScope, resolveUserPrimaryDepartmentId } from "@/lib/dept-scope"
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
  return resolveUserPrimaryDepartmentId(userId, tenantId)
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

  const tenantError = await assertTargetInCallerTenant(profile!, id)
  if (tenantError) return tenantError

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
      const tenantId = profile!.activeTenantId
      if (!tenantId) {
        return NextResponse.json(
          { error: "An active tenant is required to change roles" },
          { status: 400 },
        )
      }
      // "Admin" is tenant-wide and needs no department; every other role is
      // department/sub-department scoped. Resolving a department only matters for
      // those — a member with no department can still be promoted to tenant admin.
      const departmentId =
        body.role === "admin"
          ? null
          : await resolveRoleChangeDepartmentId(
              id,
              tenantId,
              typeof body.departmentId === "string" ? body.departmentId : null,
            )
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
        const current = await loadUserRoleChanges(id, tenantId)
        scopedRoleChanges = planLegacyDepartmentRoleUpdate({
          tenantId,
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

  // Move a member's home department (tenant-wide Members view).
  // Sub-department memberships stay additive — this records the department the
  // roster shows, and clears only the primary Profile.subDepartmentId so a new
  // sub-department in that department can be chosen afterwards.
  let moveToDepartmentId: string | null | undefined
  let moveDepartmentTenantId: string | null = null
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
      moveDepartmentTenantId = dept.tenantId
      // Managers may only move users into departments they manage.
      if (isManager && !(profile!.managedDepartmentIds ?? []).includes(moveToDepartmentId)) {
        return NextResponse.json({ error: "Department is outside your scope" }, { status: 403 })
      }
    }
    // Clear primary sub-department pointer only — do not revoke other memberships.
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

  let updatedProfile
  if (Object.keys(data).length > 0) {
    // NFR-09/DAT-05 (slice 20): user changes are audited with actor + before/after
    // state, and the change + its audit row commit TOGETHER — if the audit write
    // fails the profile change rolls back (accountability guarantee). Role
    // mutations are audited inside changeRoles; profile metadata here. Every event
    // carries the target's department so it surfaces at both tenant and department
    // level (the move case uses the new home department). tenantId may be null for
    // a platform-level (super-admin) actor.
    const auditDepartmentId =
      moveToDepartmentId ??
      (profile!.activeTenantId
        ? await resolveUserPrimaryDepartmentId(id, profile!.activeTenantId)
        : null)

    const isActiveChanged =
      "isActive" in data && data.isActive !== profileBefore?.isActive
    // Only audit metadata that actually changed — a PATCH re-sending unchanged
    // fields shouldn't create a meaningless "updated user / no changes" entry.
    const before = (profileBefore ?? {}) as Record<string, unknown>
    const changedMetaKeys = Object.keys(data)
      .filter((k) => k !== "isActive")
      .filter((k) => JSON.stringify(before[k]) !== JSON.stringify((data as Record<string, unknown>)[k]))

    updatedProfile = await prisma.$transaction(async (tx) => {
      const updated = await tx.profile.update({ where: { id }, data })

      // A restriction / reactivation is a distinct, security-relevant action —
      // audit it under its own action rather than burying it in USER_UPDATED, so
      // it is greppable regardless of which endpoint performed it (the tenant
      // members endpoint already logs USER_RESTRICTED/USER_REENABLED).
      if (isActiveChanged) {
        await recordAuditEvent({
          tenantId: profile!.activeTenantId ?? null,
          departmentId: auditDepartmentId,
          actorId: profile!.id,
          action: data.isActive ? "USER_REENABLED" : "USER_RESTRICTED",
          targetType: "Profile",
          targetId: id,
          before: { isActive: profileBefore?.isActive },
          after: { isActive: data.isActive },
          client: tx,
        })
      }

      // Non-restriction profile metadata (location, timezone, department move) is
      // audited separately from the restriction action above — only when a value
      // actually changed.
      if (changedMetaKeys.length > 0) {
        const pick = (source: Record<string, unknown>) =>
          Object.fromEntries(changedMetaKeys.map((k) => [k, source[k]]))
        await recordAuditEvent({
          tenantId: profile!.activeTenantId ?? null,
          departmentId: auditDepartmentId,
          actorId: profile!.id,
          action: "USER_UPDATED",
          targetType: "Profile",
          targetId: id,
          before: profileBefore ? pick(profileBefore as Record<string, unknown>) : profileBefore,
          after: pick(data as Record<string, unknown>),
          client: tx,
        })
      }

      return updated
    })
  } else {
    updatedProfile = await prisma.profile.findUniqueOrThrow({ where: { id } })
  }

  // SA-03: an individual user restriction (isActive: false) needs the same
  // "invalidated within 60s" guarantee as a tenant suspension — getProfile()
  // already blocks their next request, this covers an already-open tab.
  if (data.isActive === false && profileBefore?.isActive !== false) {
    await broadcastForceLogout([id], "Your account has been restricted. Contact your administrator for access.")
  }

  // Persist the home department the members roster reads back.
  // Managers are stored on DepartmentManager (that is what puts them under a
  // department). Everyone else — including an admin just demoted to agent, who
  // has no sub-department yet — is stored on DepartmentMember. Deleting those
  // rows without writing the new one is why the department dropdown snapped
  // back to "No department" after refresh.
  // Sub-department memberships stay additive; this does not deactivate them.
  if (moveToDepartmentId) {
    const tenantId = moveDepartmentTenantId
    const [tenantMembership, managerRows] = await Promise.all([
      tenantId
        ? prisma.tenantMembership.findFirst({
            where: { userId: id, tenantId, isActive: true },
            select: { role: true },
          })
        : Promise.resolve(null),
      tenantId
        ? prisma.departmentManager.findMany({
            where: { userId: id, department: { tenantId } },
            select: { departmentId: true, role: true },
          })
        : Promise.resolve([] as { departmentId: string; role: string }[]),
    ])
    const managesDepartment = managerRows.some((row) => row.role === "manager" || row.role === "admin")
    const isManagerHome = (tenantMembership?.role === "manager" || managesDepartment) && tenantMembership?.role !== "admin"

    if (isManagerHome) {
      // Single-department members are moved; someone already managing several
      // departments keeps the others and gains this one.
      if (managerRows.length <= 1) {
        await prisma.departmentManager.deleteMany({
          where: {
            userId: id,
            departmentId: { not: moveToDepartmentId },
            ...(tenantId ? { department: { tenantId } } : {}),
          },
        })
      }
      await prisma.departmentManager.upsert({
        where: { departmentId_userId: { departmentId: moveToDepartmentId, userId: id } },
        create: {
          departmentId: moveToDepartmentId,
          userId: id,
          role: "manager",
          assignedBy: profile!.id,
        },
        update: {},
      })
      await prisma.departmentMember.deleteMany({ where: { userId: id } })
      const { syncUserRoleAssignments } = await import("@/lib/role-assignment")
      await syncUserRoleAssignments(id)
    } else {
      await prisma.departmentMember.deleteMany({
        where: { userId: id, departmentId: { not: moveToDepartmentId } },
      })
      await prisma.departmentMember.upsert({
        where: { departmentId_userId: { departmentId: moveToDepartmentId, userId: id } },
        create: {
          departmentId: moveToDepartmentId,
          userId: id,
          addedBy: profile!.id,
        },
        update: {},
      })
    }
  } else if (moveToDepartmentId === null) {
    await prisma.departmentMember.deleteMany({ where: { userId: id } })
  }

  // Keep SubDepartmentMembership in sync with Profile.subDepartmentId.
  // Membership is additive: agents/sub-managers may belong to multiple
  // sub-departments. Changing the primary sub-department must not remove others.
  if ("subDepartmentId" in data) {
    const nextSubDepartmentId = data.subDepartmentId ?? null
    if (nextSubDepartmentId) {
      const subDepartment = await prisma.subDepartment.findUnique({
        where: { id: nextSubDepartmentId },
        select: { departmentId: true },
      })
      if (subDepartment) {
        await (prisma.subDepartmentMembership as any).upsert({
          where: { userId_subDepartmentId: { userId: id, subDepartmentId: nextSubDepartmentId } },
          create: { userId: id, subDepartmentId: nextSubDepartmentId, role: "agent", isActive: true },
          update: { isActive: true },
        })
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

  if (profile!.role !== "admin" && !profile!.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  if (id === profile!.id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 })
  }

  const tenantError = await assertTargetInCallerTenant(profile!, id)
  if (tenantError) return tenantError

  const target = await prisma.profile.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  })
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 })
  if (target.deletedAt) return NextResponse.json({ error: "User already deleted" }, { status: 409 })

  // Resolve the target's department BEFORE the transaction below drops their
  // memberships, so the deletion audit can still be attributed to a department.
  const deletedDepartmentId = await resolveUserPrimaryDepartmentId(id, profile!.activeTenantId)

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
  // The USER_DELETED audit row is written in the SAME transaction (accountability
  // guarantee, acceptance #6): if the audit can't be recorded the deletion rolls
  // back. AuditEvent has no FK to Profile and is not part of this cascade, so the
  // trail survives the user's deletion (acceptance #5). tenantId may be null for a
  // platform-level (super-admin) actor.
  const deletedAt = new Date()
  await prisma.$transaction(async (tx) => {
    // ── Membership & access ──────────────────────────────────────────────────
    await (tx.subDepartmentMembership as any).deleteMany({ where: { userId: id } })
    await tx.departmentManager.deleteMany({ where: { userId: id } })
    await tx.departmentMember.deleteMany({ where: { userId: id } })
    await tx.departmentAccess.deleteMany({ where: { userId: id } })
    await (tx.projectMember as any).deleteMany({ where: { userId: id } })
    await (tx.ticketAssignee as any).deleteMany({ where: { userId: id } })
    // ── Ticket assignment ────────────────────────────────────────────────────
    // Null-out primary assignee on open tickets so they can be re-assigned
    await tx.ticket.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } })
    // ── Personal workspace data ──────────────────────────────────────────────
    await tx.timeEntry.deleteMany({ where: { profileId: id } })
    await tx.apiKey.deleteMany({ where: { createdById: id } })
    // ── Notifications & activity ─────────────────────────────────────────────
    await tx.activityLog.deleteMany({ where: { actorId: id } })
    await tx.notification.deleteMany({ where: { OR: [{ recipientId: id }, { actorId: id }] } })
    await tx.mention.deleteMany({ where: { mentionedUserId: id } })
    await tx.pushSubscription.deleteMany({ where: { userId: id } })
    // ── Join requests ────────────────────────────────────────────────────────
    await tx.joinRequest.deleteMany({ where: { userId: id } })
    // ── Soft-delete the profile ──────────────────────────────────────────────
    await tx.profile.update({ where: { id }, data: { deletedAt, subDepartmentId: null } })
    // ── Immutable audit record (same transaction) ────────────────────────────
    await recordAuditEvent({
      tenantId: profile!.activeTenantId ?? null,
      departmentId: deletedDepartmentId,
      actorId: profile!.id,
      action: "USER_DELETED",
      targetType: "Profile",
      targetId: id,
      before: { deletedAt: null },
      after: { deletedAt: deletedAt.toISOString() },
      client: tx,
    })
  })

  // The cascade above clears every source table but not the derived
  // RoleAssignment rows — rebuild them (from the now-empty sources) so the
  // deleted user's canonical assignments are cleared and the cached scope
  // invalidated, rather than leaking stale rows (see lib/role-assignment).
  const { syncUserRoleAssignments } = await import("@/lib/role-assignment")
  await syncUserRoleAssignments(id)

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
