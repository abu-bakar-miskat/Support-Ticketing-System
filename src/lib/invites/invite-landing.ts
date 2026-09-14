import "server-only";
import type { LoginCookie } from "@/lib/auth/complete-login";
import { ACTIVE_TENANT_COOKIE, TENANT_COOKIE_MAX_AGE } from "@/lib/tenant-scope";
import {
  DEPT_SLUG_COOKIE,
  SUBDEPT_SLUG_COOKIE,
  TENANT_SLUG_COOKIE,
} from "@/lib/tenant-path";

const DEPT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/** The scope an accepted invite drops the invitee into. */
export type InviteLandingScope = {
  tenantId: string;
  tenantSlug: string | null;
  departmentId: string | null;
  departmentSlug: string | null;
  subDepartmentId: string | null;
  subDepartmentSlug: string | null;
};

/**
 * Public URL for an accepted invite. Always ends on a known dashboard root
 * (`departments` / `manager` / `board`) so a department slug like
 * `help-center` is not treated as the page itself, and the first document can
 * paint a skeleton instead of blocking on Home aggregates.
 */
export function inviteLandingPath(
  role: string,
  scope: Pick<
    InviteLandingScope,
    "tenantSlug" | "departmentSlug" | "subDepartmentSlug"
  >,
): string {
  const tenant = scope.tenantSlug;
  const dept = scope.departmentSlug;
  const sub = scope.subDepartmentSlug;
  if (role === "admin") {
    return tenant ? `/${tenant}/departments` : "/departments";
  }
  if (role === "manager") {
    if (tenant && dept) return `/${tenant}/${dept}/manager`;
    return "/manager";
  }
  const board = "board";
  if (tenant && dept && sub && sub !== tenant && sub !== dept) {
    return `/${tenant}/${dept}/${sub}/${board}`;
  }
  if (tenant && dept) return `/${tenant}/${dept}/${board}`;
  if (tenant) return `/${tenant}/${board}`;
  return `/${board}`;
}

/**
 * Cookies that activate an accepted invite's tenant / department /
 * sub-department.
 *
 * Shared by both invite types (TenantInvite and DepartmentInvite) so an invitee
 * lands in the same scope whichever link they followed. Keeping one
 * implementation matters: while these were built separately, the
 * department-invite path set only the active-department cookie, so a user
 * invited into a *sub*-department arrived without sub-department scope.
 */
export function inviteLandingCookies(scope: InviteLandingScope): LoginCookie[] {
  const cookies: LoginCookie[] = [
    {
      name: ACTIVE_TENANT_COOKIE,
      value: scope.tenantId,
      options: {
        httpOnly: true,
        path: "/",
        maxAge: TENANT_COOKIE_MAX_AGE,
        sameSite: "lax",
      },
    },
  ];
  if (scope.tenantSlug) {
    cookies.push({
      name: TENANT_SLUG_COOKIE,
      value: scope.tenantSlug,
      options: { path: "/", maxAge: TENANT_COOKIE_MAX_AGE, sameSite: "lax" },
    });
  }
  if (scope.departmentId) {
    cookies.push({
      name: "pen_active_dept",
      value: scope.departmentId,
      options: {
        httpOnly: true,
        path: "/",
        maxAge: DEPT_COOKIE_MAX_AGE,
        sameSite: "lax",
      },
    });
    cookies.push({
      name: DEPT_SLUG_COOKIE,
      value: scope.departmentSlug ?? "",
      options: { path: "/", maxAge: DEPT_COOKIE_MAX_AGE, sameSite: "lax" },
    });
  }
  if (scope.subDepartmentId) {
    cookies.push({
      name: "pen_active_team",
      value: scope.subDepartmentId,
      options: {
        httpOnly: true,
        path: "/",
        maxAge: DEPT_COOKIE_MAX_AGE,
        sameSite: "lax",
      },
    });
    cookies.push({
      name: SUBDEPT_SLUG_COOKIE,
      value: scope.subDepartmentSlug ?? "",
      options: { path: "/", maxAge: DEPT_COOKIE_MAX_AGE, sameSite: "lax" },
    });
  }
  return cookies;
}
