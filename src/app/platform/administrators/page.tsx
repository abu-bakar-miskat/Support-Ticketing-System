import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { PlatformAdministrators } from "@/components/platform/platform-administrators"

export const dynamic = "force-dynamic"

export default async function PlatformAdministratorsPage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!profile.isSuperAdmin) redirect("/")

  // Load every active profile once; the super-admin management list is derived
  // from this same set (filtered by isSuperAdmin) and the "All users" directory
  // uses it wholesale — no second round-trip.
  const rows = await prisma.profile.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      role: true,
      isSuperAdmin: true,
      subDepartment: {
        select: { name: true, department: { select: { id: true, name: true } } },
      },
      memberships: {
        where: { isActive: true },
        select: {
          subDepartment: { select: { name: true, department: { select: { id: true, name: true } } } },
        },
      },
      directDeptMemberships: {
        select: { department: { select: { id: true, name: true } } },
      },
      managedDepartments: {
        select: { department: { select: { id: true, name: true } } },
      },
      tenantMemberships: {
        where: { isActive: true },
        select: { tenant: { select: { name: true } } },
      },
    },
    orderBy: { name: "asc" },
  })

  const users = rows.map((r) => {
    // Aggregate every department this user touches (primary team, extra team
    // memberships, direct membership, or management) into one de-duplicated list.
    const deptMap = new Map<
      string,
      { id: string; name: string; isManager: boolean; subDepartments: Set<string> }
    >()

    const ensureDept = (id: string, name: string) => {
      let entry = deptMap.get(id)
      if (!entry) {
        entry = { id, name, isManager: false, subDepartments: new Set() }
        deptMap.set(id, entry)
      }
      return entry
    }

    if (r.subDepartment?.department) {
      ensureDept(r.subDepartment.department.id, r.subDepartment.department.name).subDepartments.add(
        r.subDepartment.name,
      )
    }
    for (const m of r.memberships) {
      if (!m.subDepartment?.department) continue
      ensureDept(m.subDepartment.department.id, m.subDepartment.department.name).subDepartments.add(
        m.subDepartment.name,
      )
    }
    for (const d of r.directDeptMemberships) {
      ensureDept(d.department.id, d.department.name)
    }
    for (const d of r.managedDepartments) {
      ensureDept(d.department.id, d.department.name).isManager = true
    }

    return {
      id: r.id,
      name: r.name,
      email: r.email,
      avatarUrl: r.avatarUrl,
      role: r.role,
      isSuperAdmin: r.isSuperAdmin,
      tenants: [...new Set(r.tenantMemberships.map((t) => t.tenant.name))],
      departments: [...deptMap.values()]
        .map((d) => ({
          id: d.id,
          name: d.name,
          isManager: d.isManager,
          subDepartments: [...d.subDepartments].sort((a, b) => a.localeCompare(b)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }
  })

  const admins = users.filter((u) => u.isSuperAdmin)

  return <PlatformAdministrators admins={admins} allUsers={users} currentUserId={profile.id} />
}
