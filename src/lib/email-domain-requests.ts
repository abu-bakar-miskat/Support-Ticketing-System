import "server-only";
import { prisma } from "@/lib/db";
import { runAsSystem } from "@/lib/request-scope";
import { createNotification } from "@/lib/notify";
import { addTenantDomain, type TenantDomain } from "@/lib/email-domains";
import { listManagedDomains, type DomainOpError } from "@/lib/resend-domains";

/**
 * Domain-request workflow (managers/sub-managers ask → tenant admin approves).
 *
 * A department or sub-department manager can't register sending domains directly
 * (that's tenant-admin only), so they file an EmailDomainRequest from their
 * mailbox page. Tenant admins are notified, review the request in the domains
 * section, and approve it — which auto-registers the domain (addTenantDomain)
 * assigned to the requested scope — or reject it. Like EmailDomain, this table
 * isn't tenant-scoped by the Prisma extension, so every query runs via
 * runAsSystem with an explicit tenantId filter.
 */

const DOMAIN_RE = /^([a-z0-9-]+\.)+[a-z]{2,}$/;

export type DomainRequest = {
  id: string;
  domain: string;
  status: string;
  note: string | null;
  departmentId: string;
  departmentName: string;
  subDepartmentName: string | null;
  requesterName: string;
  createdAt: string;
};

/** Files a request. Validates the scope belongs to the tenant, then notifies
 * every tenant admin. */
export async function createDomainRequest(params: {
  tenantId: string;
  departmentId: string;
  subDepartmentId?: string | null;
  domain: string;
  note?: string | null;
  requestedById: string;
  requesterName: string;
}): Promise<{ ok: true } | { error: string }> {
  const domain = params.domain.trim().toLowerCase();
  if (!DOMAIN_RE.test(domain)) return { error: "Enter a valid domain, e.g. mail.example.com" };

  const subId = params.subDepartmentId?.trim() || null;
  // Validate scope against the tenant.
  const dept = await runAsSystem(() =>
    prisma.department.findFirst({ where: { id: params.departmentId, tenantId: params.tenantId }, select: { id: true } }),
  );
  if (!dept) return { error: "That department doesn't belong to this workspace." };
  if (subId) {
    const sub = await runAsSystem(() =>
      prisma.subDepartment.findFirst({
        where: { id: subId, tenantId: params.tenantId, departmentId: params.departmentId },
        select: { id: true },
      }),
    );
    if (!sub) return { error: "That sub-department doesn't belong to this department." };
  }

  // Already registered? Then no request is needed.
  const registered = await runAsSystem(() =>
    prisma.emailDomain.findUnique({ where: { name: domain }, select: { id: true } }),
  );
  if (registered) return { error: "That domain is already registered for this workspace." };

  // De-dupe pending requests for the same domain in this tenant.
  const dupe = await runAsSystem(() =>
    prisma.emailDomainRequest.findFirst({
      where: { tenantId: params.tenantId, domain, status: "pending" },
      select: { id: true },
    }),
  );
  if (dupe) return { error: "There's already a pending request for that domain." };

  await runAsSystem(() =>
    prisma.emailDomainRequest.create({
      data: {
        tenantId: params.tenantId,
        departmentId: params.departmentId,
        subDepartmentId: subId,
        domain,
        note: params.note?.trim() || null,
        requestedById: params.requestedById,
      },
    }),
  );

  // Notify every active tenant admin.
  const admins = await runAsSystem(() =>
    prisma.tenantMembership.findMany({
      where: { tenantId: params.tenantId, role: "admin", isActive: true },
      select: { userId: true },
    }),
  );
  for (const { userId } of admins) {
    createNotification({
      recipientId: userId,
      actorId: params.requestedById,
      type: "domain_request_submitted",
      message: `${params.requesterName} requested the sending domain ${domain}`,
    }).catch(() => undefined);
  }

  return { ok: true };
}

/** Pending requests for a tenant, newest first, with resolved names. */
export async function listPendingDomainRequests(tenantId: string): Promise<DomainRequest[]> {
  const rows = await runAsSystem(() =>
    prisma.emailDomainRequest.findMany({
      where: { tenantId, status: "pending" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        domain: true,
        status: true,
        note: true,
        departmentId: true,
        subDepartmentId: true,
        requestedById: true,
        createdAt: true,
      },
    }),
  );
  if (rows.length === 0) return [];

  const deptIds = [...new Set(rows.map((r) => r.departmentId))];
  const subIds = [...new Set(rows.map((r) => r.subDepartmentId).filter((v): v is string => Boolean(v)))];
  const requesterIds = [...new Set(rows.map((r) => r.requestedById))];

  const [depts, subs, requesters] = await Promise.all([
    runAsSystem(() => prisma.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true } })),
    subIds.length
      ? runAsSystem(() => prisma.subDepartment.findMany({ where: { id: { in: subIds } }, select: { id: true, name: true } }))
      : Promise.resolve([] as { id: string; name: string }[]),
    runAsSystem(() => prisma.profile.findMany({ where: { id: { in: requesterIds } }, select: { id: true, name: true } })),
  ]);
  const deptName = new Map(depts.map((d) => [d.id, d.name]));
  const subName = new Map(subs.map((s) => [s.id, s.name]));
  const reqName = new Map(requesters.map((p) => [p.id, p.name]));

  return rows.map((r) => ({
    id: r.id,
    domain: r.domain,
    status: r.status,
    note: r.note,
    departmentId: r.departmentId,
    departmentName: deptName.get(r.departmentId) ?? "—",
    subDepartmentName: r.subDepartmentId ? subName.get(r.subDepartmentId) ?? null : null,
    requesterName: reqName.get(r.requestedById) ?? "Someone",
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function countPendingDomainRequests(tenantId: string): Promise<number> {
  return runAsSystem(() => prisma.emailDomainRequest.count({ where: { tenantId, status: "pending" } }));
}

export type ScopeDomainRequest = {
  id: string;
  domain: string;
  status: string;
  /** Live Resend verification for an approved request's registered domain.
   * Only meaningful when status === "approved" (else false). */
  verified: boolean;
  subDepartmentName: string | null;
  requesterName: string;
  createdAt: string;
  resolvedAt: string | null;
};

/**
 * Requests visible in a scope, newest first, so a requester (or their teammates)
 * can see the status of what they've asked for. Scoped to a sub-department when
 * given, else to the whole department (which includes its sub-department
 * requests, since those store the parent departmentId too).
 *
 * Domains a tenant admin registered *directly* (via the domains UI, with no
 * request) are surfaced here too — as approved entries — so they show on the
 * shared-mailbox page and can be connected once verified. Without this, a
 * domain added straight to a department never appears to the team that uses it.
 * A sub-department scope also sees whole-department domains (no sub-department)
 * that apply to it.
 */
export async function listScopeDomainRequests(
  tenantId: string,
  scope: { departmentId: string; subDepartmentId?: string | null },
): Promise<ScopeDomainRequest[]> {
  const where = scope.subDepartmentId
    ? { tenantId, subDepartmentId: scope.subDepartmentId }
    : { tenantId, departmentId: scope.departmentId };

  // Registered domains for this scope. A sub-department also inherits its
  // parent's whole-department domains (subDepartmentId null).
  const domainWhere = scope.subDepartmentId
    ? {
        tenantId,
        OR: [
          { subDepartmentId: scope.subDepartmentId },
          { subDepartmentId: null, departmentId: scope.departmentId },
        ],
      }
    : { tenantId, departmentId: scope.departmentId };

  const [rows, domainRows] = await Promise.all([
    runAsSystem(() =>
      prisma.emailDomainRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true,
          domain: true,
          status: true,
          subDepartmentId: true,
          requestedById: true,
          createdAt: true,
          resolvedAt: true,
        },
      }),
    ),
    runAsSystem(() =>
      prisma.emailDomain.findMany({
        where: domainWhere,
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, subDepartmentId: true, createdAt: true },
      }),
    ),
  ]);

  // Drop registered domains already represented by a request row (an approved
  // request registers a domain — keep the request entry, which has requester
  // info), so each domain appears once.
  const requestDomainNames = new Set(rows.map((r) => r.domain.toLowerCase()));
  const extraDomains = domainRows.filter((d) => !requestDomainNames.has(d.name.toLowerCase()));

  if (rows.length === 0 && extraDomains.length === 0) return [];

  const subIds = [
    ...new Set(
      [...rows, ...extraDomains].map((r) => r.subDepartmentId).filter((v): v is string => Boolean(v)),
    ),
  ];
  const requesterIds = [...new Set(rows.map((r) => r.requestedById))];
  // Live verification is needed for any approved request or registered domain.
  const needVerification = rows.some((r) => r.status === "approved") || extraDomains.length > 0;
  const [subs, requesters, managed] = await Promise.all([
    subIds.length
      ? runAsSystem(() => prisma.subDepartment.findMany({ where: { id: { in: subIds } }, select: { id: true, name: true } }))
      : Promise.resolve([] as { id: string; name: string }[]),
    requesterIds.length
      ? runAsSystem(() => prisma.profile.findMany({ where: { id: { in: requesterIds } }, select: { id: true, name: true } }))
      : Promise.resolve([] as { id: string; name: string }[]),
    needVerification ? listManagedDomains() : Promise.resolve([]),
  ]);
  const subName = new Map(subs.map((s) => [s.id, s.name]));
  const reqName = new Map(requesters.map((p) => [p.id, p.name]));
  const verifiedByName = new Map<string, boolean>();
  if (Array.isArray(managed)) {
    for (const d of managed) verifiedByName.set(d.name.toLowerCase(), d.status === "verified");
  }

  const requestEntries: ScopeDomainRequest[] = rows.map((r) => ({
    id: r.id,
    domain: r.domain,
    status: r.status,
    verified: r.status === "approved" ? verifiedByName.get(r.domain.toLowerCase()) ?? false : false,
    subDepartmentName: r.subDepartmentId ? subName.get(r.subDepartmentId) ?? null : null,
    requesterName: reqName.get(r.requestedById) ?? "Someone",
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
  }));

  // A directly-registered domain has no request behind it, so render it as an
  // approved entry — the form then shows its verification badge and, once
  // verified, a Connect-mailbox action.
  const domainEntries: ScopeDomainRequest[] = extraDomains.map((d) => ({
    id: d.id,
    domain: d.name,
    status: "approved",
    verified: verifiedByName.get(d.name.toLowerCase()) ?? false,
    subDepartmentName: d.subDepartmentId ? subName.get(d.subDepartmentId) ?? null : null,
    requesterName: "Workspace admin",
    createdAt: d.createdAt.toISOString(),
    resolvedAt: d.createdAt.toISOString(),
  }));

  return [...requestEntries, ...domainEntries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Approves a request: registers the domain assigned to the requested scope and
 * notifies the requester. Returns the registered domain for the admin UI. */
export async function approveDomainRequest(
  tenantId: string,
  requestId: string,
  adminProfileId: string,
): Promise<TenantDomain | DomainOpError | null> {
  const req = await runAsSystem(() =>
    prisma.emailDomainRequest.findFirst({
      where: { id: requestId, tenantId, status: "pending" },
      select: { id: true, domain: true, departmentId: true, subDepartmentId: true, requestedById: true },
    }),
  );
  if (!req) return null;

  const domain = await addTenantDomain(tenantId, req.domain, {
    departmentId: req.departmentId,
    subDepartmentId: req.subDepartmentId,
  });
  if ("error" in domain) return domain;

  await runAsSystem(() =>
    prisma.emailDomainRequest.update({
      where: { id: req.id },
      data: { status: "approved", resolvedById: adminProfileId, resolvedAt: new Date() },
    }),
  );

  createNotification({
    recipientId: req.requestedById,
    actorId: adminProfileId,
    type: "domain_request_reviewed",
    message: `Your sending domain ${req.domain} was approved and is being set up.`,
  }).catch(() => undefined);

  return domain;
}

/** Deletes a declined request (housekeeping). Only rejected requests can be
 * removed — pending ones await review, approved ones back a live domain. */
export async function deleteRejectedDomainRequest(
  tenantId: string,
  requestId: string,
): Promise<{ ok: true } | null> {
  const req = await runAsSystem(() =>
    prisma.emailDomainRequest.findFirst({
      where: { id: requestId, tenantId, status: "rejected" },
      select: { id: true },
    }),
  );
  if (!req) return null;
  await runAsSystem(() => prisma.emailDomainRequest.delete({ where: { id: req.id } }));
  return { ok: true };
}

/** Rejects a request and notifies the requester. */
export async function rejectDomainRequest(
  tenantId: string,
  requestId: string,
  adminProfileId: string,
): Promise<{ ok: true } | null> {
  const req = await runAsSystem(() =>
    prisma.emailDomainRequest.findFirst({
      where: { id: requestId, tenantId, status: "pending" },
      select: { id: true, domain: true, requestedById: true },
    }),
  );
  if (!req) return null;

  await runAsSystem(() =>
    prisma.emailDomainRequest.update({
      where: { id: req.id },
      data: { status: "rejected", resolvedById: adminProfileId, resolvedAt: new Date() },
    }),
  );

  createNotification({
    recipientId: req.requestedById,
    actorId: adminProfileId,
    type: "domain_request_reviewed",
    message: `Your sending domain request for ${req.domain} was declined.`,
  }).catch(() => undefined);

  return { ok: true };
}
