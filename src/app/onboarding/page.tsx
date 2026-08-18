import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { runAsSystem } from "@/lib/request-scope"
import { OnboardingPage } from "@/components/onboarding/onboarding-page"

export default async function Page() {
  const profile = await getProfile()
  if (!profile) return null

  const [departments, pendingRequests] = await Promise.all([
    // A user with no tenant membership yet must still see every department to
    // request one — the standard tenant-scoped query would return zero rows
    // (empty `tenantIds` -> `tenantId IN ()`). Read-only, so the system bypass
    // stays narrowly scoped to this one listing.
    runAsSystem(() =>
      prisma.department.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          _count: { select: { teams: true } },
          managers: {
            select: { user: { select: { name: true } } },
            take: 2,
          },
        },
      }),
    ),
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
        teamCount: d._count.teams,
        managers: d.managers.map((m) => m.user.name),
      }))}
      pendingDeptIds={[...pendingDeptIds]}
      userId={profile.id}
      userName={profile.name}
    />
  )
}
