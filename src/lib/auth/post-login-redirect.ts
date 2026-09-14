import "server-only"
import { getUnscopedPrisma } from "@/lib/db"
import { DEPT_SLUG_COOKIE, SUBDEPT_SLUG_COOKIE } from "@/lib/tenant-path"
import type { LoginCookie } from "@/lib/auth/complete-login"

const DEPT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

function activeDeptCookie(departmentId: string): LoginCookie {
  return {
    name: "pen_active_dept",
    value: departmentId,
    options: {
      httpOnly: true,
      path: "/",
      maxAge: DEPT_COOKIE_MAX_AGE,
      sameSite: "lax",
    },
  }
}

/** Active-dept id cookie plus its slug cookie (for /<tenant>/<dept>/… URLs). */
async function deptCookies(departmentId: string): Promise<LoginCookie[]> {
  const dept = await getUnscopedPrisma().department.findUnique({
    where: { id: departmentId },
    select: { slug: true },
  })
  return [
    activeDeptCookie(departmentId),
    {
      name: DEPT_SLUG_COOKIE,
      value: dept?.slug ?? "",
      options: { path: "/", maxAge: DEPT_COOKIE_MAX_AGE, sameSite: "lax" },
    },
  ]
}

function clearActiveDeptCookie(): LoginCookie {
  return { name: "pen_active_dept", value: "", options: { path: "/", maxAge: 0 } }
}

function activeTeamCookie(subDepartmentId: string): LoginCookie {
  return {
    name: "pen_active_team",
    value: subDepartmentId,
    options: {
      httpOnly: true,
      path: "/",
      maxAge: DEPT_COOKIE_MAX_AGE,
      sameSite: "lax",
    },
  }
}

export type PostLoginLanding = {
  redirectPath: string
  cookies: LoginCookie[]
}

/**
 * Default landing path + workspace cookies after a successful login when the
 * caller did not request a specific deep link (`next === "/"`).
 *
 * Role routing (role-hierarchy.md):
 *   Super Admin      → /platform (no active dept)
 *   Tenant admin     → /departments (org console)
 *   Department admin → /departments (their assigned departments), or "/" when
 *                      they administer just one
 *   Manager          → /manager (department console)
 *   Sub-manager/Agent → "/" (personal Home), with the active department /
 *                      sub-department cookie set
 *   Tenant member with no dept yet → "/" (Home, not onboarding)
 *   Unassigned       → /onboarding
 */
export async function resolvePostLoginLanding(userId: string, isSuperAdmin: boolean): Promise<PostLoginLanding> {
  if (isSuperAdmin) {
    return {
      redirectPath: "/platform",
      cookies: [clearActiveDeptCookie()],
    }
  }

  // Unscoped client so login landing cannot recurse into getProfile / Prisma
  // tenant scope (that hang sent invitees to a spinner or /onboarding).
  const db = getUnscopedPrisma()
  const [tenantMembership, managedDepts, memberships, deptAccess] = await Promise.all([
    db.tenantMembership.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { role: true },
    }),
    db.departmentManager.findMany({
      where: { userId },
      select: { departmentId: true, role: true },
      orderBy: { assignedAt: "asc" },
    }),
    db.subDepartmentMembership.findMany({
      where: { userId, isActive: true },
      select: {
        subDepartmentId: true,
        subDepartment: { select: { departmentId: true, slug: true } },
      },
      orderBy: { joinedAt: "asc" },
    }),
    db.departmentAccess.findMany({
      where: {
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { departmentId: true },
      orderBy: { grantedAt: "asc" },
    }),
  ])

  if (tenantMembership?.role === "admin") {
    return { redirectPath: "/departments", cookies: [] }
  }

  // A department-scoped Admin (departmentManager.role === "admin") owns the
  // department, so they land on their departments list — every department they
  // administer. Plain Managers (any other role) run one department day-to-day.
  // The /departments page collapses to a single home when an admin administers
  // just one department, so pre-set that department's cookie for that case.
  const adminDeptIds = managedDepts
    .filter((m) => m.role === "admin")
    .map((m) => m.departmentId)
  const managerDeptIds = managedDepts
    .filter((m) => m.role !== "admin")
    .map((m) => m.departmentId)

  if (adminDeptIds.length > 1) {
    return { redirectPath: "/departments", cookies: [] }
  }
  if (adminDeptIds.length === 1) {
    return { redirectPath: "/", cookies: await deptCookies(adminDeptIds[0]!) }
  }

  // Tenant-level managers (invite with no department yet) and department
  // managers both land on the manager console — not agent Home.
  if (tenantMembership?.role === "manager" || managerDeptIds.length > 0) {
    const deptId = managerDeptIds[0] ?? adminDeptIds[0]
    return {
      redirectPath: "/manager",
      cookies: deptId ? await deptCookies(deptId) : [],
    }
  }

  if (memberships.length > 0) {
    const primary = memberships[0]!
    const cookies: LoginCookie[] = [
      activeTeamCookie(primary.subDepartmentId),
      {
        name: SUBDEPT_SLUG_COOKIE,
        value: primary.subDepartment.slug ?? "",
        options: { path: "/", maxAge: DEPT_COOKIE_MAX_AGE, sameSite: "lax" },
      },
    ]
    if (primary.subDepartment.departmentId) {
      cookies.unshift(...(await deptCookies(primary.subDepartment.departmentId)))
    }
    return { redirectPath: "/", cookies }
  }

  if (deptAccess.length > 0) {
    return {
      redirectPath: "/",
      cookies: await deptCookies(deptAccess[0]!.departmentId),
    }
  }

  // They belong to a tenant (agent / sub-manager) but have no sub-department
  // yet. Home is their view; onboarding is only for people with no workspace.
  if (tenantMembership) {
    return { redirectPath: "/", cookies: [] }
  }

  return { redirectPath: "/onboarding", cookies: [] }
}

/** Whether a signed-in user should land on the board from `/` (not tenant admin / super admin). */
export function shouldRedirectHomeToBoard(role: string, isSuperAdmin: boolean): boolean {
  if (isSuperAdmin) return false
  if (role === "admin") return false
  return role === "manager" || role === "sub_manager" || role === "agent"
}
