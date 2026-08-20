import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { DepartmentsDiscoveryPage } from "@/components/sub-departments/sub-departments-discovery-page"

export const metadata = { title: "Join a Department — Support Ticketing System" }

export default async function Page() {
  const profile = await getProfile()
  if (!profile) redirect("/login")

  if (profile.role === "admin") redirect("/")

  const [departments, myRequests] = await Promise.all([
    prisma.department.findMany({
      orderBy: { name: "asc" },
      include: {
        subDepartments: {
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            _count: { select: { memberships: { where: { isActive: true } } } },
          },
        },
      },
    }),
    prisma.joinRequest.findMany({
      where: { userId: profile.id, status: "pending" },
      select: { departmentId: true },
    }),
  ])

  const pendingDeptIds = new Set(myRequests.map((r) => r.departmentId).filter(Boolean))
  const memberDeptIds = new Set(
    (await prisma.subDepartmentMembership.findMany({
      where: { userId: profile.id, isActive: true },
      include: { subDepartment: { select: { departmentId: true } } },
    })).map((m) => m.subDepartment.departmentId)
  )

  const deptList = departments.map((d) => ({
    id: d.id,
    name: d.name,
    subDepartmentCount: d.subDepartments.length,
    memberCount: d.subDepartments.reduce((sum, t) => sum + t._count.memberships, 0),
    isPending: pendingDeptIds.has(d.id),
    isMember: memberDeptIds.has(d.id),
  }))

  return <DepartmentsDiscoveryPage departments={deptList} userName={profile.name} />
}
