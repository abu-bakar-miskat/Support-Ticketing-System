import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { OnboardingPage } from "@/components/onboarding/onboarding-page"

export default async function Page() {
  const profile = await getProfile()
  if (!profile) return null

  const [departments, pendingRequests] = await Promise.all([
    prisma.department.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        _count: { select: { subDepartments: true } },
        managers: {
          select: { user: { select: { name: true } } },
          take: 2,
        },
      },
    }),
    prisma.joinRequest.findMany({
      where: { userId: profile.id, status: { in: ["pending", "approved"] } },
      select: { departmentId: true, status: true },
    }),
  ])

  const pendingDeptIds = new Set(
    pendingRequests.filter((r) => r.status === "pending").map((r) => r.departmentId).filter(Boolean) as string[],
  )

  return (
    <OnboardingPage
      departments={departments.map((d) => ({
        id: d.id,
        name: d.name,
        subDepartmentCount: d._count.subDepartments,
        managers: d.managers.map((m) => m.user.name),
      }))}
      pendingDeptIds={[...pendingDeptIds]}
      userId={profile.id}
      userName={profile.name}
    />
  )
}
