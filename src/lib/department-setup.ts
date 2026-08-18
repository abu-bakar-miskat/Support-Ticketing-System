import "server-only";
import { prisma } from "@/lib/db";

/**
 * Department setup walkthrough gating (slice 15, DS-08/09/10).
 *
 * `Department.setupCompletedAt` gates operational use: null blocks ticket
 * creation on every path (manual, intake form, mailbox connection) until an
 * admin/manager completes the initial setup review (DS-08). Existing
 * departments are backfilled to non-null at migration time — this can only
 * ever block a department created *after* that migration.
 *
 * `DepartmentManager.walkthroughDismissedAt` is a separate, non-blocking
 * signal: a newly-assigned manager of an already-*active* department sees a
 * dismissible overview instead of a hard block (DS-09). It starts null on
 * every new DepartmentManager row (Prisma's default), so "newly assigned" is
 * simply "hasn't dismissed it yet" — no separate recency check needed.
 */

export type DepartmentOperationalCheck = { ok: true } | { ok: false; error: string };

/** DS-08: whether a department may accept new tickets on any creation path. */
export async function isDepartmentOperational(departmentId: string): Promise<boolean> {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { setupCompletedAt: true },
  });
  return department?.setupCompletedAt != null;
}

/**
 * Guard for every ticket-creation path (manual create, intake conversion,
 * mailbox-connection email). Callers should surface `error` and refuse to
 * create the ticket when `ok` is false.
 */
export async function assertDepartmentOperational(departmentId: string): Promise<DepartmentOperationalCheck> {
  const operational = await isDepartmentOperational(departmentId);
  if (!operational) {
    return {
      ok: false,
      error: "This department hasn't completed initial setup yet — it can't accept tickets until setup review is complete.",
    };
  }
  return { ok: true };
}

/** DS-08: marks setup review complete. Idempotent — safe to call more than once. */
export async function completeDepartmentSetup(departmentId: string): Promise<void> {
  await prisma.department.update({
    where: { id: departmentId },
    data: { setupCompletedAt: new Date() },
  });
}

/**
 * DS-09: true when this manager should see the dismissible setup overview —
 * only for an already-*active* department (a pending one is DS-08's hard
 * block, not this non-blocking overview) whose DepartmentManager row they
 * haven't dismissed yet. False (including) when they aren't a manager of
 * this department at all.
 */
export async function needsWalkthroughOverview(userId: string, departmentId: string): Promise<boolean> {
  const [department, manager] = await Promise.all([
    prisma.department.findUnique({ where: { id: departmentId }, select: { setupCompletedAt: true } }),
    prisma.departmentManager.findUnique({
      where: { departmentId_userId: { departmentId, userId } },
      select: { walkthroughDismissedAt: true },
    }),
  ]);
  if (!department?.setupCompletedAt) return false;
  if (!manager) return false;
  return manager.walkthroughDismissedAt == null;
}

/** DS-09: dismisses the overview for this manager. Idempotent. */
export async function dismissWalkthroughOverview(userId: string, departmentId: string): Promise<void> {
  await prisma.departmentManager.updateMany({
    where: { departmentId, userId },
    data: { walkthroughDismissedAt: new Date() },
  });
}
