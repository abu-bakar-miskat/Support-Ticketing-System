import "server-only"
import { prisma } from "@/lib/db"
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
  const dept = await prisma.department.findUnique({
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
 *   Manager/Sub-manager/Agent → "/" (their own home dashboard), with the active
 *                      department/sub-department cookie set so home dispatches
 *                      by role (manager → /manager, others → HomeDashboard)
 *   Unassigned       → /onboarding
 */
export async function resolvePostLoginLanding(userId: string, isSuperAdmin: boolean): Promise<PostLoginLanding> {
  if (isSuperAdmin) {
    return {
      redirectPath: "/platform",
      cookies: [clearActiveDeptCookie()],
    }
  }

  const [tenantMembership, managedDepts, memberships, directMembers, deptAccess] = await Promise.all([
    prisma.tenantMembership.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { role: true },
    }),
    prisma.departmentManager.findMany({
      where: { userId },
      select: { departmentId: true, role: true },
      orderBy: { assignedAt: "asc" },
    }),
    prisma.subDepartmentMembership.findMany({
      where: { userId, isActive: true },
      select: {
        subDepartmentId: true,
        subDepartment: { select: { departmentId: true, slug: true } },
      },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.departmentMember.findMany({
      where: { userId },
      select: { departmentId: true },
      orderBy: { addedAt: "asc" },
    }),
    prisma.departmentAccess.findMany({
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

  // Managers, sub-managers, and agents land on their own home dashboard ("/"),
  // not the raw board. Home dispatches by role (manager → /manager, everyone
  // else → HomeDashboard) using the active-dept cookie set here.
  if (managerDeptIds.length > 0) {
    return {
      redirectPath: "/",
      cookies: await deptCookies(managerDeptIds[0]!),
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

  if (directMembers.length > 0) {
    return {
      redirectPath: "/",
      cookies: await deptCookies(directMembers[0]!.departmentId),
    }
  }

  if (deptAccess.length > 0) {
    return {
      redirectPath: "/",
      cookies: await deptCookies(deptAccess[0]!.departmentId),
    }
  }

  return { redirectPath: "/onboarding", cookies: [] }
}

/** Whether a signed-in user should land on the board from `/` (not tenant admin / super admin). */
export function shouldRedirectHomeToBoard(role: string, isSuperAdmin: boolean): boolean {
  if (isSuperAdmin) return false
  if (role === "admin") return false
  return role === "manager" || role === "sub_manager" || role === "agent"
}
