import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { runAsSystem } from "@/lib/request-scope"
import { OnboardingPage } from "@/components/onboarding/onboarding-page"

export default async function Page() {
  const profile = await getProfile()
  if (!profile) return null

  const [departments, pendingRequests] = await Promise.all([
    // A user with no tenant membership yet must still see every tenant's
    // departments to request one — the standard tenant-scoped query would
    // return zero rows (empty `tenantIds` -> `tenantId IN ()`). Read-only, so
    // the system bypass stays narrowly scoped to this one listing.
    runAsSystem(async () =>
      await prisma.department.findMany({
        orderBy: [{ tenant: { name: "asc" } }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          tenant: { select: { id: true, name: true } },
          managers: {
            select: { user: { select: { name: true } } },
            take: 2,
          },
          subDepartments: {
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          },
        },
      }),
    ),
    prisma.joinRequest.findMany({
      where: { userId: profile.id, status: { in: ["pending", "approved"] } },
      select: { departmentId: true, subDepartmentId: true, status: true },
    }),
  ])

  // A join request targets either a whole department or a specific
  // sub-department; key pending state by whichever id it carries.
  const pendingKeys = new Set(
    pendingRequests
      .filter((r) => r.status === "pending")
      .map((r) => r.subDepartmentId ?? r.departmentId)
      .filter(Boolean) as string[],
  )

  // Group departments under their tenant so the user picks tenant ->
  // department -> (optional) sub-department when requesting access.
  const tenantMap = new Map<
    string,
    {
      id: string
      name: string
      departments: {
        id: string
        name: string
        managers: string[]
        subDepartments: { id: string; name: string }[]
      }[]
    }
  >()

  for (const d of departments) {
    let group = tenantMap.get(d.tenant.id)
    if (!group) {
      group = { id: d.tenant.id, name: d.tenant.name, departments: [] }
      tenantMap.set(d.tenant.id, group)
    }
    group.departments.push({
      id: d.id,
      name: d.name,
      managers: d.managers.map((m) => m.user.name),
      subDepartments: d.subDepartments,
    })
  }

  return (
    <OnboardingPage
      tenants={[...tenantMap.values()]}
      pendingKeys={[...pendingKeys]}
      userId={profile.id}
      userName={profile.name}
    />
  )
}
