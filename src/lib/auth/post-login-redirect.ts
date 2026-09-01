import "server-only"
import { prisma } from "@/lib/db"
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
 *   Super Admin     → /platform (no active dept)
 *   Tenant admin    → /departments (org console)
 *   Manager         → /board in first managed department
 *   Sub-manager/Agent → /board in assigned sub-department's department
 *   Unassigned      → /onboarding
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
      select: { departmentId: true },
      orderBy: { assignedAt: "asc" },
    }),
    prisma.subDepartmentMembership.findMany({
      where: { userId, isActive: true },
      select: {
        subDepartmentId: true,
        subDepartment: { select: { departmentId: true } },
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

  if (managedDepts.length > 0) {
    return {
      redirectPath: "/board",
      cookies: [activeDeptCookie(managedDepts[0]!.departmentId)],
    }
  }

  if (memberships.length > 0) {
    const primary = memberships[0]!
    const cookies: LoginCookie[] = [activeTeamCookie(primary.subDepartmentId)]
    if (primary.subDepartment.departmentId) {
      cookies.unshift(activeDeptCookie(primary.subDepartment.departmentId))
    }
    return { redirectPath: "/board", cookies }
  }

  if (directMembers.length > 0) {
    return {
      redirectPath: "/board",
      cookies: [activeDeptCookie(directMembers[0]!.departmentId)],
    }
  }

  if (deptAccess.length > 0) {
    return {
      redirectPath: "/board",
      cookies: [activeDeptCookie(deptAccess[0]!.departmentId)],
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
