import "server-only";
import { prisma } from "@/lib/db";
import { decryptMailboxCredentials, encryptMailboxCredentials } from "@/lib/mailbox-credentials";
import { getPullMailProvider, type HealthCheckResult, type PullCredentials } from "@/lib/mail-providers";
import type { PullContext } from "@/lib/mail-providers/types";
import { createNotification } from "@/lib/notify";
import { sendMailboxConnectionFailedAlertEmail } from "@/lib/email";
import { recordAuditEvent } from "@/lib/audit-log";
import type { AssignmentMethod, MailboxAuthType, MailboxScopeType } from "@/generated/prisma/enums";

/**
 * MailboxConnection CRUD + EM-07 health monitoring (slice 14). Every live
 * connection is a Microsoft 365 mailbox; legacy RESEND rows are kept in the
 * database but ignored everywhere (`LIVE` below).
 *
 * `credentialsRef` (NFR-03: encrypted at rest, never returned by any API) is
 * deliberately excluded from every `select` below — not just omitted by the
 * caller — so a future call site can't accidentally leak it by forgetting to
 * strip a field.
 */

/** Only Microsoft 365 connections are live; legacy Resend rows are ignored. */
const LIVE = { authType: "OAUTH_M365" } as const;

const SAFE_SELECT = {
  id: true,
  tenantId: true,
  departmentId: true,
  subDepartmentId: true,
  scopeType: true,
  address: true,
  authType: true,
  assignmentMethod: true,
  manualAssigneeIds: true,
  isActive: true,
  status: true,
  failureCount: true,
  lastCheckedAt: true,
  lastErrorAt: true,
  lastErrorMessage: true,
  nextCheckAt: true,
  lastSyncedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type MailboxConnectionSafe = {
  id: string;
  tenantId: string;
  /** Null for a TENANT-scoped (send-only) mailbox. */
  departmentId: string | null;
  /** The sub-department new tickets file into; null for TENANT scope. */
  subDepartmentId: string | null;
  scopeType: MailboxScopeType;
  address: string;
  authType: MailboxAuthType;
  assignmentMethod: AssignmentMethod | null;
  manualAssigneeIds: string[];
  isActive: boolean;
  status: "ACTIVE" | "AUTH_ERROR" | "UNREACHABLE";
  failureCount: number;
  lastCheckedAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorMessage: string | null;
  nextCheckAt: Date | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function listMailboxConnections(departmentId: string): Promise<MailboxConnectionSafe[]> {
  // Id-keyed read (callers verified dept access) — run unscoped to skip the
  // per-query scope waterfall.
  const { runAsSystem } = await import("@/lib/request-scope");
  return runAsSystem(() =>
    prisma.mailboxConnection.findMany({
      where: { departmentId, ...LIVE },
      select: SAFE_SELECT,
      orderBy: { createdAt: "asc" },
    }),
  );
}

export async function listMailboxConnectionsForSubDepartment(subDepartmentId: string): Promise<MailboxConnectionSafe[]> {
  const { runAsSystem } = await import("@/lib/request-scope");
  return runAsSystem(() =>
    prisma.mailboxConnection.findMany({
      where: { subDepartmentId, ...LIVE },
      select: SAFE_SELECT,
      orderBy: { createdAt: "asc" },
    }),
  );
}

/** The tenant's send-only mailbox(es) — at most one is allowed (lib/mailbox-outbound.ts). */
export async function listTenantMailboxConnections(tenantId: string): Promise<MailboxConnectionSafe[]> {
  const { runAsSystem } = await import("@/lib/request-scope");
  return runAsSystem(() =>
    prisma.mailboxConnection.findMany({
      where: { tenantId, scopeType: "TENANT", ...LIVE },
      select: SAFE_SELECT,
      orderBy: { createdAt: "asc" },
    }),
  );
}

export async function getMailboxConnectionSafe(id: string): Promise<MailboxConnectionSafe | null> {
  return prisma.mailboxConnection.findUnique({ where: { id }, select: SAFE_SELECT });
}

export async function createMailboxConnection(params: {
  tenantId: string;
  departmentId: string | null;
  subDepartmentId: string | null;
  scopeType: MailboxScopeType;
  address: string;
  authType: MailboxAuthType;
  /** Plaintext, encrypted before storage. */
  plaintextCredentials?: string | null;
  /** Pull providers: the starting sync cursor ("now"), so history isn't imported. */
  syncCursor?: unknown;
  /** Profile id of the admin performing the change, for the audit trail. */
  actorId: string;
}): Promise<MailboxConnectionSafe> {
  const credentialsRef = params.plaintextCredentials
    ? encryptMailboxCredentials(params.plaintextCredentials)
    : null;

  const created = await prisma.mailboxConnection.create({
    data: {
      tenantId: params.tenantId,
      departmentId: params.departmentId,
      subDepartmentId: params.subDepartmentId,
      scopeType: params.scopeType,
      address: params.address.trim().toLowerCase(),
      authType: params.authType,
      credentialsRef,
      ...(params.syncCursor !== undefined ? { syncCursor: params.syncCursor as never } : {}),
    },
    select: SAFE_SELECT,
  });

  await recordAuditEvent({
    tenantId: created.tenantId,
    departmentId: created.departmentId,
    actorId: params.actorId,
    action: "MAILBOX_CONNECTION_CREATED",
    targetType: "MailboxConnection",
    targetId: created.id,
    after: { address: created.address, scopeType: created.scopeType, subDepartmentId: created.subDepartmentId, authType: created.authType },
  }).catch(() => undefined);

  return created;
}

export async function updateMailboxConnection(
  id: string,
  params: {
    assignmentMethod?: AssignmentMethod | null;
    manualAssigneeIds?: string[];
    /** Manual on/off switch. When toggled it's audited as ENABLED / DISABLED. */
    isActive?: boolean;
  },
  actorId: string,
): Promise<MailboxConnectionSafe> {
  const before = await prisma.mailboxConnection.findUnique({ where: { id }, select: SAFE_SELECT });

  const updated = await prisma.mailboxConnection.update({
    where: { id },
    data: {
      ...(params.assignmentMethod !== undefined ? { assignmentMethod: params.assignmentMethod } : {}),
      ...(params.manualAssigneeIds !== undefined ? { manualAssigneeIds: params.manualAssigneeIds } : {}),
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
    },
    select: SAFE_SELECT,
  });

  // A toggle of the on/off switch is recorded as its own ENABLED/DISABLED action
  // so the trail reads clearly; any other edit is a generic UPDATED.
  const toggled = params.isActive !== undefined && before?.isActive !== updated.isActive;
  await recordAuditEvent({
    tenantId: updated.tenantId,
    departmentId: updated.departmentId,
    actorId,
    action: toggled
      ? updated.isActive
        ? "MAILBOX_CONNECTION_ENABLED"
        : "MAILBOX_CONNECTION_DISABLED"
      : "MAILBOX_CONNECTION_UPDATED",
    targetType: "MailboxConnection",
    targetId: updated.id,
    before: before ? { address: before.address, isActive: before.isActive, assignmentMethod: before.assignmentMethod } : undefined,
    after: { address: updated.address, isActive: updated.isActive, assignmentMethod: updated.assignmentMethod },
  }).catch(() => undefined);

  return updated;
}

export async function deleteMailboxConnection(id: string, actorId: string): Promise<void> {
  const before = await prisma.mailboxConnection.findUnique({ where: { id }, select: SAFE_SELECT });
  await prisma.mailboxConnection.delete({ where: { id } });
  if (before) {
    await recordAuditEvent({
      tenantId: before.tenantId,
      departmentId: before.departmentId,
      actorId,
      action: "MAILBOX_CONNECTION_DELETED",
      targetType: "MailboxConnection",
      targetId: before.id,
      before: { address: before.address, scopeType: before.scopeType, subDepartmentId: before.subDepartmentId },
    }).catch(() => undefined);
  }
}

export type MailboxRoute = {
  id: string;
  address: string;
  tenantId: string;
  departmentId: string;
  subDepartmentId: string;
  isActive: boolean;
};

/**
 * EM-01/02/03: where new mail synced from this connection files tickets. Null
 * for a TENANT-scoped mailbox (send-only — it never opens tickets).
 */
export async function getMailboxRouteById(id: string): Promise<MailboxRoute | null> {
  const row = await prisma.mailboxConnection.findUnique({
    where: { id },
    select: { id: true, address: true, tenantId: true, departmentId: true, subDepartmentId: true, isActive: true },
  });
  if (!row?.departmentId || !row.subDepartmentId) return null;
  return { ...row, departmentId: row.departmentId, subDepartmentId: row.subDepartmentId };
}

// ─── Pull-provider credentials ──────────────────────────────────────────────

/** Encrypts OAuth credentials into an opaque `credentialsRef` blob. */
export function encryptPullCredentials(credentials: PullCredentials): string {
  return encryptMailboxCredentials(JSON.stringify(credentials));
}

/**
 * Builds the provider context for a pull connection: decrypted credentials
 * plus a writer that re-encrypts rotated OAuth tokens back onto the row.
 */
export function pullContextFor(connection: { id: string; credentialsRef: string | null }): PullContext {
  if (!connection.credentialsRef) throw new Error("This mailbox has no stored credentials — reconnect it");
  const credentials = JSON.parse(decryptMailboxCredentials(connection.credentialsRef)) as PullCredentials;
  return {
    credentials,
    saveCredentials: async (next) => {
      await prisma.mailboxConnection.update({
        where: { id: connection.id },
        data: { credentialsRef: encryptPullCredentials(next) },
      });
    },
  };
}

/**
 * Replaces a pull connection's credentials after the admin re-authorizes it
 * (OAuth reconnect) and clears its failure state so sync
 * resumes on the next run.
 */
export async function replacePullCredentials(
  id: string,
  credentials: PullCredentials,
  actorId: string,
  syncCursor?: unknown,
): Promise<MailboxConnectionSafe> {
  const updated = await prisma.mailboxConnection.update({
    where: { id },
    data: {
      credentialsRef: encryptPullCredentials(credentials),
      status: "ACTIVE",
      failureCount: 0,
      lastErrorAt: null,
      lastErrorMessage: null,
      nextCheckAt: null,
      ...(syncCursor !== undefined ? { syncCursor: syncCursor as never } : {}),
    },
    select: SAFE_SELECT,
  });
  await recordAuditEvent({
    tenantId: updated.tenantId,
    departmentId: updated.departmentId,
    actorId,
    action: "MAILBOX_CONNECTION_UPDATED",
    targetType: "MailboxConnection",
    targetId: updated.id,
    after: { address: updated.address, reauthorized: true },
  }).catch(() => undefined);
  return updated;
}

/**
 * EM-06: records inbound mail that intentionally did not create a ticket
 * (auto-generated mail or email received while the mailbox is paused). There
 * is no ticket to attach it to, so it goes here instead. Best-effort — never
 * throws.
 */
export async function logMailSuppression(params: {
  tenantId: string;
  mailboxConnectionId: string;
  providerMessageId: string;
  fromEmail: string | null;
  toAddress: string | null;
  subject: string | null;
  reason: string;
}): Promise<void> {
  try {
    await prisma.mailSuppressionLog.create({ data: params });
  } catch {
    // best-effort
  }
}

// ─── EM-07: connection health + exponential backoff ────────────────────────

/** Backoff schedule in minutes after each consecutive failure (capped at the last step). */
const BACKOFF_MINUTES = [1, 5, 15, 60, 240, 1440];

function nextBackoffMinutes(failureCount: number): number {
  const idx = Math.min(failureCount, BACKOFF_MINUTES.length - 1);
  return BACKOFF_MINUTES[idx];
}

/**
 * Checks one connection via its provider and updates status/backoff state.
 * On the FIRST failure after being healthy, notifies the department's
 * managers immediately (EM-07: "within one polling cycle"). Best-effort —
 * never throws, so one bad connection can't abort the sweep.
 */
export async function checkMailboxConnectionHealth(
  connectionId: string,
  now: Date = new Date(),
  // Manual re-checks from the UI pass `notifyOnNewFailure: false` so an admin
  // testing a connection never triggers a real alert email to the department
  // manager. The scheduled sweep keeps the default so genuine outages still
  // notify exactly once on the healthy→failed transition.
  { notifyOnNewFailure = true }: { notifyOnNewFailure?: boolean } = {},
): Promise<void> {
  try {
    const connection = await prisma.mailboxConnection.findUnique({
      where: { id: connectionId },
      select: {
        id: true,
        authType: true,
        credentialsRef: true,
        status: true,
        failureCount: true,
        tenantId: true,
        departmentId: true,
        address: true,
      },
    });
    if (!connection) return;

    const result = await runProviderHealthCheck(connection);

    if (result.ok) {
      await prisma.mailboxConnection.update({
        where: { id: connectionId },
        data: {
          status: "ACTIVE",
          failureCount: 0,
          lastCheckedAt: now,
          lastErrorAt: null,
          lastErrorMessage: null,
          nextCheckAt: null,
        },
      });
      return;
    }

    await recordMailboxConnectionFailure(connection, result.error, now, { notifyOnNewFailure });
  } catch {
    // best-effort — a health-check failure must never crash the sweep
  }
}

async function runProviderHealthCheck(connection: {
  id: string;
  authType: MailboxAuthType;
  credentialsRef: string | null;
}): Promise<HealthCheckResult> {
  const pull = getPullMailProvider(connection.authType);
  if (!pull) return { ok: false, error: `No provider implementation for ${connection.authType}` };
  try {
    return await pull.checkHealth(pullContextFor(connection));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't check the mailbox" };
  }
}

/**
 * Moves a connection into the failing state with exponential backoff. Shared
 * by the health check and the pull sync (an expired OAuth grant surfaces
 * there first). Notifies managers only on the healthy→failed transition.
 */
export async function recordMailboxConnectionFailure(
  connection: {
    id: string;
    status: string;
    failureCount: number;
    tenantId: string;
    departmentId: string | null;
    address: string;
  },
  error: string,
  now: Date = new Date(),
  {
    notifyOnNewFailure = true,
    status = "AUTH_ERROR",
  }: { notifyOnNewFailure?: boolean; status?: "AUTH_ERROR" | "UNREACHABLE" } = {},
): Promise<void> {
  const wasHealthy = connection.status === "ACTIVE";
  const failureCount = connection.failureCount + 1;
  const backoffMinutes = nextBackoffMinutes(failureCount);

  await prisma.mailboxConnection.update({
    where: { id: connection.id },
    data: {
      status,
      failureCount,
      lastCheckedAt: now,
      lastErrorAt: now,
      lastErrorMessage: error.slice(0, 500),
      nextCheckAt: new Date(now.getTime() + backoffMinutes * 60_000),
    },
  });

  if (wasHealthy && notifyOnNewFailure) {
    await notifyMailboxConnectionFailure(connection, error);
  }
}

/** Department mailbox → its managers; tenant mailbox → the tenant's admins. */
async function notifyMailboxConnectionFailure(
  { tenantId, departmentId, address }: { tenantId: string; departmentId: string | null; address: string },
  error: string,
): Promise<void> {
  const recipients = departmentId
    ? await prisma.departmentManager.findMany({
        where: { departmentId },
        select: { user: { select: { id: true, name: true, email: true } } },
      })
    : await prisma.tenantMembership.findMany({
        where: { tenantId, role: "admin", isActive: true },
        select: { user: { select: { id: true, name: true, email: true } } },
      });

  for (const { user } of recipients) {
    createNotification({
      recipientId: user.id,
      type: "mailbox_connection_failed",
      message: `Mailbox connection ${address} failed: ${error}`,
    }).catch(() => undefined);

    sendMailboxConnectionFailedAlertEmail({
      to: user.email,
      managerName: user.name,
      address,
      error,
      tenantId,
      departmentId,
    }).catch(() => undefined);
  }
}

/**
 * Cron entry point: re-checks every connection due for a check — ACTIVE ones
 * on every sweep, failing ones only once their backoff window has elapsed —
 * so a persistently broken mailbox doesn't get hammered every cycle.
 */
export async function sweepMailboxConnectionHealth(now: Date = new Date()): Promise<{ checked: number }> {
  const due = await prisma.mailboxConnection.findMany({
    where: { ...LIVE, OR: [{ status: "ACTIVE" }, { nextCheckAt: { lte: now } }] },
    select: { id: true },
  });
  for (const { id } of due) {
    await checkMailboxConnectionHealth(id, now);
  }
  return { checked: due.length };
}
