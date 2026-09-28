import "server-only";
import { prisma } from "@/lib/db";
import { runAsSystem } from "@/lib/request-scope";
import {
  createManagedDomain,
  enableManagedDomainReceiving,
  getManagedDomain,
  verifyManagedDomain,
  removeManagedDomain,
  listManagedDomains,
  selectBestManagedDomain,
  type ManagedDomain,
  type DomainOpError,
} from "@/lib/resend-domains";

/**
 * Per-tenant view of Resend sending domains (slice: tenant self-serve domain
 * verification).
 *
 * Resend domains are account-wide — Resend has no notion of tenancy — so the
 * `EmailDomain` table records which tenant owns which Resend domain. Live status
 * and DNS records are always read back from Resend (never cached in our DB) so
 * they can't drift; this module joins the two.
 *
 * `EmailDomain` is intentionally NOT in TENANT_SCOPED_MODELS (lib/prisma-scope),
 * so — exactly like listMailboxConnections — every query here runs via
 * `runAsSystem` and enforces isolation with an explicit `tenantId` filter and an
 * ownership check on every mutation. A tenant can only ever see or touch its own
 * domains; `resendId` from the client is authorised against ownership before any
 * Resend call, so it can't be used to reach another tenant's (or an unclaimed)
 * domain.
 */

/** Same shape the UI already renders (see resend-domains.ManagedDomain); `id`
 * here is the Resend domain id, used for verify/get/remove. `scopeLabel` names
 * the department / sub-department the tenant admin assigned the domain to. */
export type TenantDomain = ManagedDomain & { scopeLabel: string | null };

/** The department or sub-department a domain is being assigned to. Exactly one
 * of the two ids is chosen by the admin; when a sub-department is chosen its
 * parent department is recorded alongside it. */
export type DomainScopeInput = {
  departmentId?: string | null;
  subDepartmentId?: string | null;
};

/** A department and its sub-departments, for the cascading add-domain selector:
 * the admin picks a department first, then a sub-department (or the whole
 * department). */
export type DepartmentScopeTree = {
  id: string;
  name: string;
  subDepartments: { id: string; name: string }[];
};

/** Departments (with their sub-departments) a tenant admin can assign a domain
 * to, for the cascading add-domain selector. */
export async function listTenantDepartmentScopes(tenantId: string): Promise<DepartmentScopeTree[]> {
  const depts = await runAsSystem(() =>
    prisma.department.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        subDepartments: { orderBy: { name: "asc" }, select: { id: true, name: true } },
      },
    }),
  );
  return depts.map((d) => ({ id: d.id, name: d.name, subDepartments: d.subDepartments }));
}

/** Resolves + validates a chosen scope against the tenant. Returns the ids to
 * store (department always set) and a display label, or an error string. */
async function resolveScope(
  tenantId: string,
  scope: DomainScopeInput,
): Promise<{ departmentId: string; subDepartmentId: string | null; label: string } | { error: string }> {
  const subId = scope.subDepartmentId?.trim() || null;
  const deptId = scope.departmentId?.trim() || null;

  if (subId) {
    const sub = await runAsSystem(() =>
      prisma.subDepartment.findFirst({
        where: { id: subId, tenantId },
        select: { id: true, name: true, departmentId: true, department: { select: { name: true } } },
      }),
    );
    if (!sub) return { error: "That sub-department doesn't belong to this workspace." };
    return {
      departmentId: sub.departmentId,
      subDepartmentId: sub.id,
      label: `${sub.department?.name ?? "—"} › ${sub.name}`,
    };
  }

  if (deptId) {
    const dept = await runAsSystem(() =>
      prisma.department.findFirst({ where: { id: deptId, tenantId }, select: { id: true, name: true } }),
    );
    if (!dept) return { error: "That department doesn't belong to this workspace." };
    return { departmentId: dept.id, subDepartmentId: null, label: dept.name };
  }

  return { error: "Select the department or sub-department that will use this domain." };
}

/** Resolves scope labels for a set of stored department/sub-department ids. */
async function scopeLabels(
  deptIds: string[],
  subIds: string[],
): Promise<{ depts: Map<string, string>; subs: Map<string, string> }> {
  const [depts, subs] = await Promise.all([
    deptIds.length
      ? runAsSystem(() => prisma.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true } }))
      : Promise.resolve([] as { id: string; name: string }[]),
    subIds.length
      ? runAsSystem(() => prisma.subDepartment.findMany({ where: { id: { in: subIds } }, select: { id: true, name: true } }))
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);
  return {
    depts: new Map(depts.map((d) => [d.id, d.name])),
    subs: new Map(subs.map((s) => [s.id, s.name])),
  };
}

/** A domain a tenant's mailboxes actually send/receive from, derived from the
 * addresses on its MailboxConnections (department + sub-department). Read-only:
 * these aren't necessarily registered through the domain UI, so they carry no
 * resendId — just live status and which teams use them. */
export type InUseDomain = {
  domain: string;
  status: ManagedDomain["status"];
  /** True when this domain is also a managed EmailDomain (add/verify/remove). */
  registered: boolean;
  /** Sub-department (or department) names whose mailboxes use this domain. */
  usedBy: string[];
};

/**
 * Domains currently in use by the tenant's mailbox connections, each with its
 * live Resend verification status and the teams using it. Complements
 * listTenantDomains (which lists only domains explicitly registered here): a
 * team can be sending from a domain nobody added through the UI yet.
 */
export async function listTenantInUseDomains(tenantId: string): Promise<InUseDomain[]> {
  const conns = await runAsSystem(() =>
    prisma.mailboxConnection.findMany({
      where: { tenantId },
      select: {
        address: true,
        department: { select: { name: true } },
        subDepartment: { select: { name: true } },
      },
    }),
  );
  if (conns.length === 0) return [];

  const usageByDomain = new Map<string, Set<string>>();
  for (const c of conns) {
    const domain = c.address.split("@")[1]?.trim().toLowerCase();
    if (!domain) continue;
    const label = c.subDepartment?.name ?? c.department?.name ?? "—";
    const labels = usageByDomain.get(domain) ?? new Set<string>();
    labels.add(label);
    usageByDomain.set(domain, labels);
  }
  if (usageByDomain.size === 0) return [];

  const [all, registeredRows] = await Promise.all([
    listManagedDomains(),
    runAsSystem(() => prisma.emailDomain.findMany({ where: { tenantId }, select: { name: true } })),
  ]);
  const statusByName = new Map<string, ManagedDomain["status"]>();
  if (!("error" in all)) {
    for (const domain of usageByDomain.keys()) {
      statusByName.set(domain, selectBestManagedDomain(all, domain)?.status ?? "unknown");
    }
  }
  const registeredNames = new Set(registeredRows.map((r) => r.name.toLowerCase()));

  return [...usageByDomain.entries()]
    .map(([domain, labels]) => ({
      domain,
      status: statusByName.get(domain) ?? ("unknown" as ManagedDomain["status"]),
      registered: registeredNames.has(domain),
      usedBy: [...labels].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.domain.localeCompare(b.domain));
}

/** Lists a tenant's registered domains with live status pulled from Resend. */
export async function listTenantDomains(tenantId: string): Promise<TenantDomain[]> {
  const rows = await runAsSystem(() =>
    prisma.emailDomain.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { name: true, resendId: true, createdAt: true, departmentId: true, subDepartmentId: true },
    }),
  );
  if (rows.length === 0) return [];

  // One Resend list call gives status for every domain; records are fetched
  // lazily per-domain on expand (getTenantDomain).
  const [all, labels] = await Promise.all([
    listManagedDomains(),
    scopeLabels(
      rows.map((r) => r.departmentId).filter((v): v is string => Boolean(v)),
      rows.map((r) => r.subDepartmentId).filter((v): v is string => Boolean(v)),
    ),
  ]);
  // A domain name can exist in more than one Resend region (e.g. an old
  // us-east-1 entry plus the live eu-west-1 one). Resolve status by NAME with
  // selectBestManagedDomain — preferring the verified copy — rather than the
  // single stored resendId, which may point at a region that never verified and
  // would report a stale "not verified" here while the platform view (which
  // lists every copy) shows the domain as verified. Ownership actions still key
  // off the stored resendId (see `id` below), so this only affects display.
  const allDomains = "error" in all ? [] : all;

  return rows.map((r) => {
    const deptName = r.departmentId ? labels.depts.get(r.departmentId) ?? null : null;
    const subName = r.subDepartmentId ? labels.subs.get(r.subDepartmentId) ?? null : null;
    const scopeLabel = subName ? `${deptName ?? "—"} › ${subName}` : deptName;
    const managed = selectBestManagedDomain(allDomains, r.name);
    return {
      id: r.resendId,
      name: r.name,
      status: managed?.status ?? "unknown",
      region: managed?.region ?? null,
      capabilities: managed?.capabilities ?? { sending: "disabled", receiving: "disabled" },
      createdAt: r.createdAt.toISOString(),
      records: [],
      scopeLabel,
    };
  });
}

/** Registers a domain in Resend and records tenant ownership. Rolls back the
 * Resend registration if the ownership write fails, so a half-add never leaves
 * an orphan domain only the platform admin can see. */
export async function addTenantDomain(
  tenantId: string,
  name: string,
  scope: DomainScopeInput,
): Promise<TenantDomain | DomainOpError> {
  const clean = name.trim().toLowerCase();

  // Validate the chosen scope before touching Resend, so a bad selection can't
  // leave a registered-but-unassigned domain behind.
  const resolved = await resolveScope(tenantId, scope);
  if ("error" in resolved) return resolved;

  const existing = await runAsSystem(() =>
    prisma.emailDomain.findUnique({ where: { name: clean }, select: { tenantId: true } }),
  );
  if (existing) {
    return {
      error:
        existing.tenantId === tenantId
          ? "You've already added this domain."
          : "This domain is already registered by another workspace.",
    };
  }

  // Register the domain in Resend — or, if it already exists there (e.g. a
  // mailbox already sends from it), claim that existing domain rather than
  // failing. We only roll back the Resend registration on error when *we*
  // created it, never when we merely claimed a pre-existing one.
  let resendId: string;
  let createdNew = false;
  const existingManaged = await listManagedDomains();
  const existingMatch = "error" in existingManaged
    ? undefined
    : selectBestManagedDomain(existingManaged, clean);
  if (existingMatch) {
    resendId = existingMatch.id;
    if (existingMatch.capabilities.receiving !== "enabled") {
      const enabled = await enableManagedDomainReceiving(existingMatch.id);
      if ("error" in enabled) return enabled;
    }
  } else {
    const created = await createManagedDomain(clean);
    if ("error" in created) return created;
    resendId = created.id;
    createdNew = true;
  }

  try {
    await runAsSystem(() =>
      prisma.emailDomain.create({
        data: {
          tenantId,
          name: clean,
          resendId,
          departmentId: resolved.departmentId,
          subDepartmentId: resolved.subDepartmentId,
        },
      }),
    );
  } catch {
    if (createdNew) await removeManagedDomain(resendId);
    return { error: "Failed to save the domain. Please try again." };
  }

  // Return live status + records (the claim path has none from `created`).
  const domain = await getManagedDomain(resendId);
  if ("error" in domain) {
    return {
      id: resendId,
      name: clean,
      status: "unknown",
      region: null,
      capabilities: { sending: "disabled", receiving: "disabled" },
      createdAt: null,
      records: [],
      scopeLabel: resolved.label,
    };
  }
  return { ...domain, scopeLabel: resolved.label };
}

/** Resolves ownership: returns the row (id + stored scope) if `resendId` belongs
 * to `tenantId`, else null. */
async function ownedRow(
  tenantId: string,
  resendId: string,
): Promise<{ id: string; departmentId: string | null; subDepartmentId: string | null } | null> {
  return runAsSystem(() =>
    prisma.emailDomain.findFirst({
      where: { tenantId, resendId },
      select: { id: true, departmentId: true, subDepartmentId: true },
    }),
  );
}

/** Display label for a stored scope, resolving department / sub-department names. */
async function labelForRow(row: { departmentId: string | null; subDepartmentId: string | null }): Promise<string | null> {
  const labels = await scopeLabels(
    row.departmentId ? [row.departmentId] : [],
    row.subDepartmentId ? [row.subDepartmentId] : [],
  );
  const deptName = row.departmentId ? labels.depts.get(row.departmentId) ?? null : null;
  const subName = row.subDepartmentId ? labels.subs.get(row.subDepartmentId) ?? null : null;
  return subName ? `${deptName ?? "—"} › ${subName}` : deptName;
}

/** One domain with its DNS records, only if the tenant owns it (else null). */
export async function getTenantDomain(
  tenantId: string,
  resendId: string,
): Promise<TenantDomain | DomainOpError | null> {
  const row = await ownedRow(tenantId, resendId);
  if (!row) return null;
  const domain = await getManagedDomain(resendId);
  if ("error" in domain) return domain;
  return { ...domain, scopeLabel: await labelForRow(row) };
}

/** Triggers a Resend DNS re-scan and returns the refreshed domain. */
export async function verifyTenantDomain(
  tenantId: string,
  resendId: string,
): Promise<TenantDomain | DomainOpError | null> {
  const row = await ownedRow(tenantId, resendId);
  if (!row) return null;
  const verified = await verifyManagedDomain(resendId);
  if ("error" in verified) return verified;
  const domain = await getManagedDomain(resendId);
  if ("error" in domain) return domain;
  return { ...domain, scopeLabel: await labelForRow(row) };
}

/** Removes the domain from Resend and drops the ownership row. */
export async function removeTenantDomain(
  tenantId: string,
  resendId: string,
): Promise<{ ok: true } | DomainOpError | null> {
  const row = await ownedRow(tenantId, resendId);
  if (!row) return null;
  const removed = await removeManagedDomain(resendId);
  if ("error" in removed) return removed;
  await runAsSystem(() => prisma.emailDomain.delete({ where: { id: row.id } })).catch(() => undefined);
  return { ok: true };
}
