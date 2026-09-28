import "server-only";
import { prisma, getUnscopedPrisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit-log";
import { broadcastForceLogout } from "@/lib/realtime-broadcast";

/**
 * SA-01/SA-03: Super-Admin tenant lifecycle. Suspend and soft-delete are both
 * reversible and never touch any tenant data — they only flip `status`/
 * `deletedAt` on the Tenant row itself. Blocking login is enforced in
 * lib/profile.ts (getProfile), which every request already funnels through;
 * these functions additionally fan out a "next request" is not enough on its
 * own for already-open tabs, so a `force_logout` broadcast is sent to every
 * member of the affected tenant (see lib/realtime-broadcast.ts + the client
 * poll fallback at /api/session/status).
 */

const TENANT_STATUSES = ["active", "suspended"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];
export function isValidTenantStatus(value: unknown): value is TenantStatus {
  return typeof value === "string" && (TENANT_STATUSES as readonly string[]).includes(value);
}

async function activeMemberIds(tenantId: string): Promise<string[]> {
  const rows = await prisma.tenantMembership.findMany({
    where: { tenantId, isActive: true },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

export async function suspendTenant(params: { tenantId: string; actorId: string }) {
  const before = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    select: { id: true, status: true, deletedAt: true },
  });
  if (!before) return null;
  if (before.deletedAt) throw new Error("Tenant is soft-deleted — restore it first");
  if (before.status === "suspended") return before;

  const updated = await prisma.tenant.update({
    where: { id: params.tenantId },
    data: { status: "suspended" },
    select: { id: true, status: true, deletedAt: true },
  });

  await recordAuditEvent({
    tenantId: params.tenantId,
    actorId: params.actorId,
    action: "TENANT_SUSPENDED",
    targetType: "Tenant",
    targetId: params.tenantId,
    before,
    after: updated,
  });

  const memberIds = await activeMemberIds(params.tenantId);
  await broadcastForceLogout(memberIds, "Your organization's access has been suspended.");

  return updated;
}

export async function reactivateTenant(params: { tenantId: string; actorId: string }) {
  const before = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    select: { id: true, status: true, deletedAt: true },
  });
  if (!before) return null;
  if (before.deletedAt) throw new Error("Tenant is soft-deleted — restore it, not reactivate it");
  if (before.status === "active") return before;

  const updated = await prisma.tenant.update({
    where: { id: params.tenantId },
    data: { status: "active" },
    select: { id: true, status: true, deletedAt: true },
  });

  await recordAuditEvent({
    tenantId: params.tenantId,
    actorId: params.actorId,
    action: "TENANT_REACTIVATED",
    targetType: "Tenant",
    targetId: params.tenantId,
    before,
    after: updated,
  });

  return updated;
}

export async function softDeleteTenant(params: { tenantId: string; actorId: string }) {
  const before = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    select: { id: true, status: true, deletedAt: true },
  });
  if (!before) return null;
  if (before.deletedAt) return before;

  const updated = await prisma.tenant.update({
    where: { id: params.tenantId },
    data: { deletedAt: new Date() },
    select: { id: true, status: true, deletedAt: true },
  });

  await recordAuditEvent({
    tenantId: params.tenantId,
    actorId: params.actorId,
    action: "TENANT_DELETED",
    targetType: "Tenant",
    targetId: params.tenantId,
    before,
    after: updated,
  });

  const memberIds = await activeMemberIds(params.tenantId);
  await broadcastForceLogout(memberIds, "Your organization's access has been removed.");

  return updated;
}

export async function restoreTenant(params: { tenantId: string; actorId: string }) {
  const before = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    select: { id: true, status: true, deletedAt: true },
  });
  if (!before) return null;
  if (!before.deletedAt) return before;

  const updated = await prisma.tenant.update({
    where: { id: params.tenantId },
    data: { deletedAt: null },
    select: { id: true, status: true, deletedAt: true },
  });

  await recordAuditEvent({
    tenantId: params.tenantId,
    actorId: params.actorId,
    action: "TENANT_RESTORED",
    targetType: "Tenant",
    targetId: params.tenantId,
    before,
    after: updated,
  });

  return updated;
}

/**
 * SA-01: PERMANENT, irreversible hard-delete of an already-soft-deleted tenant
 * and ALL of its data. There is no undo.
 *
 * Most of the Tenant's relations declare `onDelete: Cascade`, but the big
 * hierarchical subtrees — `Department`, `SubDepartment`, `Ticket`, `Project`,
 * `IntakeFormConfig` and many of their child tables — reference the tenant / one
 * another with NO cascade, so a bare `tenant.delete()` fails with a foreign-key
 * violation (`Department_tenantId_fkey`, `PendingIntake_formConfigId_fkey`, …).
 * We therefore tear those subtrees down explicitly, leaf-first, then let the
 * tenant delete cascade the rest. The exact ordering below mirrors the schema's
 * non-cascade FK graph — if you add a new table under any of these, add its
 * delete here too.
 *
 * This runs inside a single transaction: if any blocker was missed the whole
 * thing rolls back rather than leaving a half-deleted tenant. We keep the fix
 * scoped to the purge path (rather than making every FK cascade via a migration)
 * so we don't silently change delete semantics elsewhere — e.g. deleting a
 * single sub-department must still be *blocked* by its tickets.
 *
 * Guardrails:
 *  - the tenant must already be soft-deleted (`deletedAt` set) — you cannot
 *    purge a live tenant out from under its users;
 *  - `confirmSlug` must exactly match the tenant's slug (defence against an
 *    accidental purge of the wrong tenant).
 *
 * The audit row is written with `tenantId: null` (a PLATFORM-level event): the
 * tenant no longer exists, and this is a platform super-admin action. It is
 * recorded only after the delete commits so the trail never claims a purge that
 * didn't happen. (AuditEvent.tenantId lost its FK — see its schema comment — so
 * the trail survives the purge regardless.)
 */
export async function purgeTenant(params: {
  tenantId: string;
  actorId: string;
  confirmSlug: string;
}) {
  const tenantId = params.tenantId;
  const before = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, name: true, type: true, status: true, deletedAt: true },
  });
  if (!before) return null;
  if (!before.deletedAt) {
    throw new Error("Tenant must be soft-deleted before it can be permanently deleted");
  }
  if (params.confirmSlug !== before.slug) {
    throw new Error("Confirmation does not match the tenant slug");
  }

  await prisma.$transaction(
    async (tx) => {
      // Collect the ids of the four tenant-scoped roots whose FKs don't cascade,
      // plus the derived sets we need to scope their non-cascade children.
      const ticketIds = (
        await tx.ticket.findMany({ where: { tenantId }, select: { id: true } })
      ).map((t) => t.id);
      const subDeptIds = (
        await tx.subDepartment.findMany({ where: { tenantId }, select: { id: true } })
      ).map((s) => s.id);
      const deptIds = (
        await tx.department.findMany({ where: { tenantId }, select: { id: true } })
      ).map((d) => d.id);
      const projectIds = (
        await tx.project.findMany({ where: { tenantId }, select: { id: true } })
      ).map((p) => p.id);
      const formConfigIds = (
        await tx.intakeFormConfig.findMany({
          where: {
            OR: [
              { departmentId: { in: deptIds } },
              { intakeSubDepartmentId: { in: subDeptIds } },
            ],
          },
          select: { id: true },
        })
      ).map((f) => f.id);
      const joinRequestIds = (
        await tx.joinRequest.findMany({ where: { departmentId: { in: deptIds } }, select: { id: true } })
      ).map((j) => j.id);

      const byTicket = { ticketId: { in: ticketIds } };

      // 1. Intake / PendingIntake block BOTH ticket deletion (Intake.ticketId) and
      //    IntakeFormConfig deletion (formConfigId) — clear them up front.
      await tx.intake.deleteMany({
        where: { OR: [byTicket, { formConfigId: { in: formConfigIds } }] },
      });
      await tx.pendingIntake.deleteMany({ where: { formConfigId: { in: formConfigIds } } });

      // 2. Ticket content, leaf-first. Attachment references Comment & TicketMessage,
      //    Mention references Comment, and Comment references TicketMessage — so the
      //    order is Attachment → Mention → Comment → TicketMessage. (Attachments and
      //    mentions can hang off a comment/message whose own ticketId is null, so
      //    scope them through the relation, not just ticketId.)
      const throughTicket = { ticket: { tenantId } };
      const throughComment = { comment: { ticket: { tenantId } } };
      const throughMessage = { message: { ticket: { tenantId } } };
      await tx.attachment.deleteMany({
        where: { OR: [throughTicket, throughComment, throughMessage] },
      });
      await tx.mention.deleteMany({ where: throughComment });
      await tx.comment.deleteMany({ where: byTicket });
      await tx.ticketMessage.deleteMany({ where: byTicket });
      await tx.activityLog.deleteMany({ where: byTicket });
      await tx.timeEntry.deleteMany({ where: byTicket });
      await tx.ticketPullRequest.deleteMany({ where: byTicket });
      await tx.gitHubCommit.deleteMany({ where: byTicket });

      // 3. Notifications hang off either a ticket or a join request (both no-cascade).
      await tx.notification.deleteMany({
        where: { OR: [byTicket, { joinRequestId: { in: joinRequestIds } }] },
      });

      // 4. Tickets (cascades TicketAssignee / SlaTimer / SlaBreach / …).
      await tx.ticket.deleteMany({ where: { tenantId } });

      // 5. Sprints reference Project (no cascade) and are referenced by the tickets
      //    we just removed — delete before projects.
      await tx.sprint.deleteMany({ where: { projectId: { in: projectIds } } });

      // 6. Projects reference Department/SubDepartment (no cascade) — before both.
      await tx.project.deleteMany({ where: { tenantId } });

      // 7. IntakeFormConfig references Department & SubDepartment (no cascade), and
      //    its Intake/PendingIntake blockers are already gone. Deleting it cascades
      //    its fields / issues / rules / assignment rules.
      await tx.intakeFormConfig.deleteMany({ where: { id: { in: formConfigIds } } });

      // 8. Remaining SubDepartment children that don't cascade + detach profiles
      //    (Profile is multi-tenant — never delete it, just null the pointer).
      const bySubDept = { subDepartmentId: { in: subDeptIds } };
      await tx.intakeIssue.deleteMany({ where: { intakeSubDepartmentId: { in: subDeptIds } } });
      await tx.routingRule.deleteMany({ where: bySubDept });
      await tx.subDepartmentStatus.deleteMany({ where: bySubDept });
      await tx.subDepartmentTicketCounter.deleteMany({ where: bySubDept });
      await tx.subDepartmentGitHubStatusMap.deleteMany({ where: bySubDept });
      await tx.profile.updateMany({ where: bySubDept, data: { subDepartmentId: null } });

      // 9. Sub-departments (must precede departments — SubDepartment.departmentId
      //    has no cascade).
      await tx.subDepartment.deleteMany({ where: { tenantId } });

      // 10. Department children that don't cascade.
      const byDept = { departmentId: { in: deptIds } };
      await tx.joinRequest.deleteMany({ where: byDept });
      await tx.apiKey.deleteMany({ where: byDept });

      // 11. Departments.
      await tx.department.deleteMany({ where: { tenantId } });

      // 12. The tenant itself — cascades the remaining ~18 relations (memberships,
      //     invites, SLA policies, mailbox connections, agreements, flags, …).
      await tx.tenant.delete({ where: { id: tenantId } });
    },
    // A tenant with lots of history touches many tables; give the interactive
    // transaction generous headroom over the 5s default.
    { timeout: 120_000 },
  );

  await recordAuditEvent({
    tenantId: null, // PLATFORM-level: a tenant-scoped row would be cascade-deleted with the tenant
    actorId: params.actorId,
    action: "TENANT_PURGED",
    targetType: "Tenant",
    targetId: tenantId,
    before,
    after: null,
  });

  return { id: before.id, slug: before.slug, purged: true as const };
}

/** True when a tenant's own status/deletedAt should deny its members' login (SA-01). */
export function tenantBlocksLogin(tenant: { status: string; deletedAt: Date | null }): boolean {
  return tenant.deletedAt !== null || tenant.status === "suspended";
}

/**
 * SA-01/SA-03: the explanatory message to show at the login screen, or null
 * when login may proceed. getProfile() enforces the same rules for every
 * request after the initial login (it just returns null, no message) — this
 * is only for surfacing *why* right at sign-in.
 */
export async function loginBlockReason(userId: string): Promise<string | null> {
  const db = getUnscopedPrisma();
  const profile = await db.profile.findUnique({
    where: { id: userId },
    select: { isActive: true, isSuperAdmin: true, deletedAt: true },
  });
  if (!profile || profile.deletedAt) return null; // unknown/deleted — let normal flow handle it
  if (!profile.isActive) {
    return "Your account has been restricted. Contact your administrator for access.";
  }
  if (profile.isSuperAdmin) return null; // transcends tenant scope

  const memberships = await db.tenantMembership.findMany({
    where: { userId, isActive: true },
    select: { tenant: { select: { status: true, deletedAt: true } } },
  });
  if (memberships.length === 0) return null; // no tenant to be blocked from
  const allBlocked = memberships.every((m) => tenantBlocksLogin(m.tenant));
  if (!allBlocked) return null;

  const anyDeleted = memberships.some((m) => m.tenant.deletedAt !== null);
  return anyDeleted
    ? "Your organization's access has been removed. Contact your administrator."
    : "Your organization's access has been suspended. Contact your administrator.";
}
