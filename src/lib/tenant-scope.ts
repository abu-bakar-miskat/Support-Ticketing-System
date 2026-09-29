/**
 * Tenant scope helpers — the outermost isolation boundary, one level above
 * department scope (see lib/dept-scope).
 *
 * Every request resolves an *active tenant* before any department logic. Users
 * reach a tenant through TenantMembership; super-admins (Profile.isSuperAdmin)
 * transcend tenant scope and may act within any tenant.
 */
import "server-only";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/db";
import {
  ACTIVE_TENANT_COOKIE_NAME,
  X_TENANT_SLUG_HEADER,
  parseActiveTenantCookie,
} from "@/lib/tenant-path";

export const ACTIVE_TENANT_COOKIE = ACTIVE_TENANT_COOKIE_NAME;
export const TENANT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type TenantProfileLike = {
  id?: string;
  isSuperAdmin?: boolean;
  /** Tenant ids the user is an active member of. */
  tenantIds?: string[];
};

export type ActiveTenantResolution = {
  id: string | null;
  requestedByUrl: boolean;
  valid: boolean;
};

/** Cookie-only active tenant id (supports legacy id-only and `id|slug`). */
export async function getActiveTenantCookie(): Promise<string | null> {
  const store = await cookies();
  return parseActiveTenantCookie(store.get(ACTIVE_TENANT_COOKIE)?.value).id;
}

/** True when the profile may act within the given tenant. */
export function hasTenantAccess(
  profile: TenantProfileLike,
  tenantId: string,
): boolean {
  if (profile.isSuperAdmin) return true;
  return (profile.tenantIds ?? []).includes(tenantId);
}

/**
 * Resolve the caller's active tenant id, validated against membership.
 *  - URL slug (x-tenant-slug from proxy) wins when the caller can access it —
 *    so /wayne-enterprise/… never renders another org's data.
 *  - Else cookie tenant when valid, else first membership / oldest tenant.
 */
export async function resolveActiveTenantContext(
  profile: TenantProfileLike,
): Promise<ActiveTenantResolution> {
  const headerList = await headers();
  const urlSlug = (headerList.get(X_TENANT_SLUG_HEADER) ?? "").trim().toLowerCase();
  if (urlSlug) {
    const bySlug = await prisma.tenant.findFirst({
      where: { slug: urlSlug, deletedAt: null },
      select: { id: true },
    });
    if (bySlug && hasTenantAccess(profile, bySlug.id)) {
      return { id: bySlug.id, requestedByUrl: true, valid: true };
    }
    return { id: null, requestedByUrl: true, valid: false };
  }

  const cookieTenant = await getActiveTenantCookie();
  const memberTenantIds = profile.tenantIds ?? [];

  if (profile.isSuperAdmin) {
    if (cookieTenant) {
      const exists = await prisma.tenant.count({ where: { id: cookieTenant } });
      if (exists > 0) return { id: cookieTenant, requestedByUrl: false, valid: true };
    }
    if (memberTenantIds.length > 0) {
      return { id: memberTenantIds[0]!, requestedByUrl: false, valid: true };
    }
    const first = await prisma.tenant.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    return { id: first?.id ?? null, requestedByUrl: false, valid: true };
  }

  if (cookieTenant && memberTenantIds.includes(cookieTenant)) {
    return { id: cookieTenant, requestedByUrl: false, valid: true };
  }
  return { id: memberTenantIds[0] ?? null, requestedByUrl: false, valid: true };
}

export async function resolveActiveTenantId(
  profile: TenantProfileLike,
): Promise<string | null> {
  return (await resolveActiveTenantContext(profile)).id;
}

/** True when a department belongs to the given tenant. */
export async function departmentInTenant(
  departmentId: string,
  tenantId: string,
): Promise<boolean> {
  const count = await prisma.department.count({
    where: { id: departmentId, tenantId },
  });
  return count > 0;
}

/** The tenant that owns a department (for stamping tenantId onto child rows). */
export async function departmentTenantId(
  departmentId: string,
): Promise<string | null> {
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { tenantId: true },
  });
  return dept?.tenantId ?? null;
}

/** The tenant that owns a subDepartment (denormalized; subDepartments always carry tenantId). */
export async function subDepartmentTenantId(subDepartmentId: string): Promise<string | null> {
  const subDepartment = await prisma.subDepartment.findUnique({
    where: { id: subDepartmentId },
    select: { tenantId: true },
  });
  return subDepartment?.tenantId ?? null;
}
