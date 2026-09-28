import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { runAsSystem } from "@/lib/request-scope";
import { avatarColorFor } from "@/lib/avatar";
import { buildActivityLogWhere, canViewDeptActivity } from "@/lib/activity-access";
import { resolveActivityScope } from "@/lib/activity-scope";
import { resolveUserScope } from "@/lib/role-assignment";
import type { AuthProfile } from "@/lib/auth";
import type { AuditLogEntry, AuditScopeKind, AuditSource } from "@/lib/audit-log-types";

export type AuditFeedFilters = {
  source?: AuditSource | null;
  action?: string | null;
  actorId?: string | null;
  /** Platform scope only — a single tenant. */
  tenantId?: string | null;
  /** Platform scope only — a single department. */
  departmentId?: string | null;
  from?: Date | null;
  to?: Date | null;
};

const PAGE_SIZE = 50;

// ── Composite time cursor ──────────────────────────────────────────────────────
// Two independent tables are merged into one createdAt-desc stream, so a plain
// row-id cursor can't page across both. The cursor is `<ms>_<entryId>` where
// entryId is the source-prefixed id; the global order is (createdAt desc, id
// desc). We over-fetch each source with `createdAt <= cursorMs` and keep only
// entries strictly after the cursor position, so nothing is skipped or repeated.

type FeedCursor = { ms: number; id: string };

function encodeCursor(c: FeedCursor): string {
  return `${c.ms}_${c.id}`;
}

function decodeCursor(raw: string | null | undefined): FeedCursor | null {
  if (!raw) return null;
  const sep = raw.indexOf("_");
  if (sep < 0) return null;
  const ms = Number(raw.slice(0, sep));
  const id = raw.slice(sep + 1);
  if (Number.isNaN(ms) || !id) return null;
  return { ms, id };
}

/** Global desc order: newer first; ties broken by id (larger id first). */
function compareEntriesDesc(a: AuditLogEntry, b: AuditLogEntry): number {
  const at = new Date(a.createdAt).getTime();
  const bt = new Date(b.createdAt).getTime();
  if (at !== bt) return bt - at;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function isAfterCursor(entry: AuditLogEntry, cursor: FeedCursor): boolean {
  const ms = new Date(entry.createdAt).getTime();
  if (ms < cursor.ms) return true;
  if (ms > cursor.ms) return false;
  return entry.id < cursor.id;
}

function dateWhere(from?: Date | null, to?: Date | null, upperBoundMs?: number): Prisma.DateTimeFilter | undefined {
  const gte = from ?? undefined;
  let lte = to ?? undefined;
  if (upperBoundMs != null) {
    const cursorDate = new Date(upperBoundMs);
    lte = lte && lte < cursorDate ? lte : cursorDate;
  }
  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

// ── Scope resolution ───────────────────────────────────────────────────────────

type ResolvedScope = {
  /** Ticket-side WHERE, or null when ticket events are out of scope. */
  ticketWhere: Prisma.ActivityLogWhereInput | null;
  /** Admin-side WHERE, or null when the caller can't see admin events. */
  adminWhere: Prisma.AuditEventWhereInput | null;
};

async function resolveScope(
  profile: AuthProfile,
  kind: AuditScopeKind,
  filters: AuditFeedFilters,
  cursorMs?: number,
): Promise<ResolvedScope> {
  const created = dateWhere(filters.from, filters.to, cursorMs);
  const actorId = filters.actorId || undefined;
  const action = filters.action || undefined;

  if (kind === "platform") {
    const scope = await resolveUserScope(profile.id);
    if (!scope.isPlatformAdmin && scope.tenantAdminIds.length === 0) {
      return { ticketWhere: null, adminWhere: null };
    }

    // A specific tenant filter must stay within the caller's authority.
    const tenantFilter: Prisma.StringFilter | string | undefined = filters.tenantId
      ? scope.isPlatformAdmin || scope.tenantAdminIds.includes(filters.tenantId)
        ? filters.tenantId
        : "__forbidden__"
      : scope.isPlatformAdmin
        ? undefined
        : { in: scope.tenantAdminIds };

    const ticketWhere: Prisma.ActivityLogWhereInput = {
      ...(created ? { createdAt: created } : {}),
      ...(actorId ? { actorId } : {}),
      ...(action ? { action: action as never } : {}),
      ...(tenantFilter || filters.departmentId
        ? {
            ticket: {
              ...(tenantFilter ? { tenantId: tenantFilter } : {}),
              ...(filters.departmentId ? { subDepartment: { departmentId: filters.departmentId } } : {}),
            },
          }
        : {}),
    };

    const adminWhere: Prisma.AuditEventWhereInput = {
      ...(created ? { createdAt: created } : {}),
      ...(actorId ? { actorId } : {}),
      ...(action ? { action } : {}),
      ...(tenantFilter ? { tenantId: tenantFilter } : {}),
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    };

    return { ticketWhere, adminWhere };
  }

  // Department scope — every department the caller can reach (tenant-wide for admins).
  const activityScope = await resolveActivityScope(profile, "all");
  const { subDepartmentIds, deptIds, tenantId } = activityScope;

  const ticketWhere = buildActivityLogWhere(
    profile,
    subDepartmentIds,
    {
      from: filters.from ?? undefined,
      to: filters.to ?? undefined,
      action,
      actorId,
    },
    tenantId,
  );
  // Fold the cursor's upper bound into createdAt (buildActivityLogWhere only sets
  // it when from/to are present).
  if (cursorMs != null) {
    const bound = dateWhere(filters.from, filters.to, cursorMs);
    if (bound) ticketWhere.createdAt = bound;
  }

  // Admin events are department-governance actions — only managers/admins see them.
  let adminWhere: Prisma.AuditEventWhereInput | null = null;
  if (canViewDeptActivity(profile)) {
    adminWhere = {
      ...(created ? { createdAt: created } : {}),
      ...(actorId ? { actorId } : {}),
      ...(action ? { action } : {}),
      // Admins (empty subDepartmentIds) get every audit event in their tenant;
      // department managers get only their departments' events.
      ...(subDepartmentIds.length === 0
        ? { tenantId }
        : { tenantId, departmentId: deptIds.length > 0 ? { in: deptIds } : "__none__" }),
    };
  }

  return { ticketWhere, adminWhere };
}

// ── Normalization ──────────────────────────────────────────────────────────────

type TicketRow = Prisma.ActivityLogGetPayload<{
  include: {
    actor: { select: { id: true; name: true; avatarUrl: true } };
    ticket: {
      select: {
        id: true;
        title: true;
        ticketNumber: true;
        status: true;
        priority: true;
        tenant: { select: { id: true; name: true } };
        subDepartment: {
          select: { id: true; name: true; prefix: true; department: { select: { id: true; name: true } } };
        };
        project: { select: { id: true; name: true; color: true } };
      };
    };
  };
}>;

function normalizeTicketRow(row: TicketRow): AuditLogEntry {
  return {
    id: `t_${row.id}`,
    source: "ticket",
    action: row.action,
    createdAt: row.createdAt.toISOString(),
    actor: {
      id: row.actor.id,
      name: row.actor.name,
      avatarUrl: row.actor.avatarUrl ?? null,
    },
    tenant: row.ticket.tenant ? { id: row.ticket.tenant.id, name: row.ticket.tenant.name } : null,
    department: row.ticket.subDepartment.department
      ? { id: row.ticket.subDepartment.department.id, name: row.ticket.subDepartment.department.name }
      : null,
    ticket: {
      id: row.ticket.id,
      humanId: `${row.ticket.subDepartment.prefix}-${row.ticket.ticketNumber}`,
      title: row.ticket.title,
      status: row.ticket.status,
      priority: row.ticket.priority,
      subDepartmentName: row.ticket.subDepartment.name,
      projectName: row.ticket.project?.name ?? null,
      projectColor: row.ticket.project?.color ?? null,
    },
    metadata: (row.metadata as Record<string, unknown>) ?? null,
    target: null,
    before: null,
    after: null,
  };
}

type AdminRow = Prisma.AuditEventGetPayload<object>;

function normalizeAdminRow(row: AdminRow): AuditLogEntry {
  return {
    id: `a_${row.id}`,
    source: "admin",
    action: row.action,
    createdAt: row.createdAt.toISOString(),
    // Names resolved in a batch pass after slicing (actorId/targetId/tenantId/
    // departmentId are all bare scalars with no Prisma relation on AuditEvent).
    actor: row.actorId ? { id: row.actorId, name: "", avatarUrl: null } : null,
    tenant: row.tenantId ? { id: row.tenantId, name: "" } : null,
    department: row.departmentId ? { id: row.departmentId, name: "" } : null,
    ticket: null,
    metadata: null,
    target: { type: row.targetType, id: row.targetId, name: null },
    before: row.before ?? null,
    after: row.after ?? null,
  };
}

// ── Feed ────────────────────────────────────────────────────────────────────────

export async function buildAuditLogFeed(
  profile: AuthProfile,
  kind: AuditScopeKind,
  filters: AuditFeedFilters,
  cursorRaw?: string | null,
): Promise<{ entries: AuditLogEntry[]; nextCursor: string | null }> {
  const cursor = decodeCursor(cursorRaw);
  const { ticketWhere, adminWhere } = await resolveScope(profile, kind, filters, cursor?.ms);

  const wantTicket = filters.source !== "admin" && ticketWhere !== null;
  const wantAdmin = filters.source !== "ticket" && adminWhere !== null;

  const [ticketRows, adminRows] = await runAsSystem(() =>
    Promise.all([
      wantTicket
        ? prisma.activityLog.findMany({
            where: ticketWhere!,
            orderBy: { createdAt: "desc" },
            take: PAGE_SIZE + 1,
            include: {
              actor: { select: { id: true, name: true, avatarUrl: true } },
              ticket: {
                select: {
                  id: true,
                  title: true,
                  ticketNumber: true,
                  status: true,
                  priority: true,
                  tenant: { select: { id: true, name: true } },
                  subDepartment: {
                    select: { id: true, name: true, prefix: true, department: { select: { id: true, name: true } } },
                  },
                  project: { select: { id: true, name: true, color: true } },
                },
              },
            },
          })
        : Promise.resolve([] as TicketRow[]),
      wantAdmin
        ? prisma.auditEvent.findMany({
            where: adminWhere!,
            orderBy: { createdAt: "desc" },
            take: PAGE_SIZE + 1,
          })
        : Promise.resolve([] as AdminRow[]),
    ]),
  );

  let merged = [
    ...ticketRows.map(normalizeTicketRow),
    ...adminRows.map(normalizeAdminRow),
  ].sort(compareEntriesDesc);

  if (cursor) merged = merged.filter((e) => isAfterCursor(e, cursor));

  const hasMore = merged.length > PAGE_SIZE;
  const entries = merged.slice(0, PAGE_SIZE);

  await resolveAdminNames(entries);

  return {
    entries,
    nextCursor: hasMore
      ? encodeCursor({ ms: new Date(entries[entries.length - 1].createdAt).getTime(), id: entries[entries.length - 1].id })
      : null,
  };
}

/** Fill actor names (+ Profile target names, + department names) for admin rows. */
async function resolveAdminNames(entries: AuditLogEntry[]): Promise<void> {
  const adminEntries = entries.filter((e) => e.source === "admin");
  if (adminEntries.length === 0) return;

  const profileIds = new Set<string>();
  const departmentIds = new Set<string>();
  const tenantIds = new Set<string>();
  for (const e of adminEntries) {
    if (e.actor) profileIds.add(e.actor.id);
    if (e.target?.type === "Profile") profileIds.add(e.target.id);
    if (e.department) departmentIds.add(e.department.id);
    if (e.tenant) tenantIds.add(e.tenant.id);
  }

  const [profiles, departments, tenants] = await runAsSystem(() =>
    Promise.all([
      profileIds.size > 0
        ? prisma.profile.findMany({
            where: { id: { in: [...profileIds] } },
            select: { id: true, name: true, email: true, avatarUrl: true },
          })
        : Promise.resolve([]),
      departmentIds.size > 0
        ? prisma.department.findMany({
            where: { id: { in: [...departmentIds] } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      tenantIds.size > 0
        ? prisma.tenant.findMany({
            where: { id: { in: [...tenantIds] } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]),
  );

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const deptById = new Map(departments.map((d) => [d.id, d]));
  const tenantById = new Map(tenants.map((t) => [t.id, t]));

  for (const e of adminEntries) {
    if (e.actor) {
      const p = profileById.get(e.actor.id);
      e.actor.name = p?.name ?? p?.email ?? "System";
      e.actor.avatarUrl = p?.avatarUrl ?? null;
    }
    if (e.target?.type === "Profile") {
      const p = profileById.get(e.target.id);
      e.target.name = p?.name ?? p?.email ?? null;
    }
    if (e.department) {
      e.department.name = deptById.get(e.department.id)?.name ?? "";
    }
    if (e.tenant) {
      // A purged tenant leaves audit rows whose tenantId no longer resolves —
      // fall back to a stable label rather than dropping the row.
      e.tenant.name = tenantById.get(e.tenant.id)?.name ?? "(deleted tenant)";
    }
  }
}

/** Actor-colour helper the UI uses (kept here so callers don't reimplement it). */
export function auditActorColor(name: string): string {
  return avatarColorFor(name);
}
