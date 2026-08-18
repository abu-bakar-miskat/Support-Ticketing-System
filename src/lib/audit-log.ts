import "server-only";
import { prisma } from "@/lib/db";

/**
 * Minimal system-wide audit trail (slice 19 needs SA-04's "flag changes are
 * audited"; the full audit-event-log feature, ticket #20, isn't built yet —
 * this is deliberately generic so that ticket can extend/query this same
 * table rather than needing a second one). Distinct from the per-ticket
 * `ActivityLog`.
 */
export async function recordAuditEvent(params: {
  tenantId: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      tenantId: params.tenantId,
      actorId: params.actorId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      before: params.before === undefined ? undefined : (params.before as never),
      after: params.after === undefined ? undefined : (params.after as never),
    },
  });
}
