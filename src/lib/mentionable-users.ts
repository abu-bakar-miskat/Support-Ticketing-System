import { prisma } from "@/lib/db"

export type MentionableUser = {
  id: string
  name: string
  avatarUrl: string | null
  departmentName: string | null
  subDepartmentName: string | null
  role: string
}

/** Members explicitly assigned to a project — the @all audience for its tickets. */
export async function getMentionableProjectMembers(
  projectId: string,
): Promise<MentionableUser[]> {
  const members = await prisma.projectMember
    .findMany({
      where: { projectId, user: { deletedAt: null } },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            role: true,
            subDepartment: {
              select: {
                name: true,
                department: { select: { name: true } },
              },
            },
          },
        },
      },
    })
    .catch(() => [] as Array<{
      user: {
        id: string
        name: string
        avatarUrl: string | null
        role: string
        subDepartment: { name: string; department: { name: string } | null } | null
      }
    }>)

  const byUser = new Map<string, MentionableUser>()
  for (const m of members) {
    const u = m.user
    if (byUser.has(u.id)) continue
    byUser.set(u.id, {
      id: u.id,
      name: u.name,
      avatarUrl: u.avatarUrl,
      departmentName: u.subDepartment?.department?.name ?? null,
      subDepartmentName: u.subDepartment?.name ?? null,
      role: u.role,
    })
  }

  return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Users who can be @mentioned on a ticket in this department. */
export async function getMentionableUsersForTicketDept(
  departmentId: string | null,
  ticketSubDepartmentId: string,
): Promise<MentionableUser[]> {
  if (!departmentId) {
    const memberships = await prisma.subDepartmentMembership
      .findMany({
        where: {
          isActive: true,
          subDepartmentId: ticketSubDepartmentId,
          user: { deletedAt: null },
        },
        select: {
          role: true,
          subDepartment: { select: { name: true } },
          user: { select: { id: true, name: true, avatarUrl: true, role: true } },
        },
      })
      .catch(() => [] as Array<{
        role: string
        subDepartment: { name: string }
        user: { id: string; name: string; avatarUrl: string | null; role: string }
      }>)

    return memberships.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      avatarUrl: m.user.avatarUrl,
      departmentName: null,
      subDepartmentName: m.subDepartment.name,
      role: m.role,
    }))
  }

  const departmentName =
    (
      await prisma.department.findUnique({
        where: { id: departmentId },
        select: { name: true },
      })
    )?.name ?? null

  const deptSubDepartmentIds = (
    await prisma.subDepartment.findMany({
      where: { departmentId },
      select: { id: true },
    })
  ).map((t) => t.id)

  const [memberships, accessGrants, deptManagers, homeSubDepartmentProfiles] = await Promise.all([
    prisma.subDepartmentMembership
      .findMany({
        where: {
          isActive: true,
          subDepartment: { departmentId },
          user: { deletedAt: null },
        },
        select: {
          userId: true,
          subDepartmentId: true,
          role: true,
          subDepartment: { select: { name: true } },
          user: { select: { id: true, name: true, avatarUrl: true, role: true } },
        },
      })
      .catch(() => []),
    prisma.departmentAccess.findMany({
      where: {
        departmentId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        user: { deletedAt: null },
      },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            role: true,
            subDepartment: {
              select: {
                name: true,
                department: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.departmentManager.findMany({
      where: { departmentId, user: { deletedAt: null } },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            role: true,
            subDepartment: {
              select: {
                name: true,
                department: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.profile.findMany({
      where: { deletedAt: null, subDepartmentId: { in: deptSubDepartmentIds } },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        role: true,
        subDepartment: { select: { name: true } },
      },
    }),
  ])

  const byUser = new Map<string, MentionableUser>()

  for (const m of memberships) {
    const entry: MentionableUser = {
      id: m.user.id,
      name: m.user.name,
      avatarUrl: m.user.avatarUrl,
      departmentName,
      subDepartmentName: m.subDepartment.name,
      role: m.role,
    }
    const existing = byUser.get(m.userId)
    if (!existing || m.subDepartmentId === ticketSubDepartmentId) byUser.set(m.userId, entry)
  }

  for (const u of homeSubDepartmentProfiles) {
    if (!byUser.has(u.id)) {
      byUser.set(u.id, {
        id: u.id,
        name: u.name,
        avatarUrl: u.avatarUrl,
        departmentName,
        subDepartmentName: u.subDepartment?.name ?? null,
        role: u.role,
      })
    }
  }

  for (const g of accessGrants) {
    const u = g.user
    if (!byUser.has(u.id)) {
      byUser.set(u.id, {
        id: u.id,
        name: u.name,
        avatarUrl: u.avatarUrl,
        departmentName: u.subDepartment?.department?.name ?? null,
        subDepartmentName: u.subDepartment?.name ?? null,
        role: u.role,
      })
    }
  }

  for (const dm of deptManagers) {
    const u = dm.user
    if (!byUser.has(u.id)) {
      byUser.set(u.id, {
        id: u.id,
        name: u.name,
        avatarUrl: u.avatarUrl,
        departmentName: u.subDepartment?.department?.name ?? departmentName,
        subDepartmentName: u.subDepartment?.name ?? null,
        role: u.role,
      })
    }
  }

  return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name))
}
