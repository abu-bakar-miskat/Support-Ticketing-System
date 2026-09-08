import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { OnboardingPage } from "@/components/onboarding/onboarding-page"

export default async function Page() {
  const profile = await getProfile()
  if (!profile) return null

  // A user with no tenant membership yet must still see EVERY tenant's
  // departments to request one. The tenant-scoped Prisma extension would filter
  // `department.findMany` down to the caller's `tenantIds` — which is empty for a
  // fresh signup, yielding `tenantId IN ()` -> zero rows and a blank onboarding
  // page. `runAsSystem` (ambient AsyncLocalStorage) does not reliably reach the
  // extension across the RSC render boundary, so these listing reads use raw SQL,
  // which bypasses the model extension entirely and is thus deterministic. They
  // are read-only and expose only department/sub-department names for joining.
  const [deptRows, subRows, mgrRows, pendingRequests] = await Promise.all([
    prisma.$queryRaw<
      { id: string; name: string; tenantId: string; tenantName: string }[]
    >`
      SELECT d.id, d.name, d."tenantId", t.name AS "tenantName"
      FROM "Department" d
      JOIN "Tenant" t ON t.id = d."tenantId"
      ORDER BY t.name ASC, d.name ASC
    `,
    prisma.$queryRaw<
      { id: string; name: string; departmentId: string }[]
    >`
      SELECT id, name, "departmentId" FROM "Team" ORDER BY name ASC
    `,
    prisma.$queryRaw<
      { departmentId: string; name: string }[]
    >`
      SELECT dm."departmentId", p.name
      FROM "DepartmentManager" dm
      JOIN "Profile" p ON p.id = dm."userId"
    `,
    prisma.joinRequest.findMany({
      where: { userId: profile.id, status: { in: ["pending", "approved"] } },
      select: { departmentId: true, subDepartmentId: true, status: true },
    }),
  ])

  // Group sub-departments and (up to 2) managers under their department id.
  const subsByDept = new Map<string, { id: string; name: string }[]>()
  for (const s of subRows) {
    const list = subsByDept.get(s.departmentId) ?? []
    list.push({ id: s.id, name: s.name })
    subsByDept.set(s.departmentId, list)
  }
  const managersByDept = new Map<string, string[]>()
  for (const m of mgrRows) {
    const list = managersByDept.get(m.departmentId) ?? []
    if (list.length < 2) list.push(m.name)
    managersByDept.set(m.departmentId, list)
  }

  const departments = deptRows.map((d) => ({
    id: d.id,
    name: d.name,
    tenant: { id: d.tenantId, name: d.tenantName },
    managers: (managersByDept.get(d.id) ?? []).map((name) => ({ user: { name } })),
    subDepartments: subsByDept.get(d.id) ?? [],
  }))

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
