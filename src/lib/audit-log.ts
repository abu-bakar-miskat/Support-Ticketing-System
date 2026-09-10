import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

type AuditWriteClient = Pick<typeof prisma, "auditEvent"> | Prisma.TransactionClient;

/**
 * Minimal system-wide audit trail (slice 19 needs SA-04's "flag changes are
 * audited"; the full audit-event-log feature, ticket #20, isn't built yet —
 * this is deliberately generic so that ticket can extend/query this same
 * table rather than needing a second one). Distinct from the per-ticket
 * `ActivityLog`.
 */
export async function recordAuditEvent(params: {
  tenantId: string;
  /**
   * Department the event is scoped to, when the action happened within one
   * (member restriction, role change, department move). Null/omitted for
   * tenant-wide events. Lets the trail be read at both tenant and dept level.
   */
  departmentId?: string | null;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  /** When supplied, the audit row is written in the same transaction. */
  client?: AuditWriteClient;
}): Promise<void> {
  const db = params.client ?? prisma;
  await db.auditEvent.create({
    data: {
      tenantId: params.tenantId,
      departmentId: params.departmentId ?? null,
      actorId: params.actorId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      before: params.before === undefined ? undefined : (params.before as never),
      after: params.after === undefined ? undefined : (params.after as never),
    },
  });
}
