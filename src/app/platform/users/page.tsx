import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { loadDirectoryUsers } from "@/lib/platform/user-directory"
import { PlatformUsers } from "@/components/platform/platform-users"
import type { InviteTenant } from "@/components/platform/platform-invite-member-dialog"

export const dynamic = "force-dynamic"

export default async function PlatformUsersPage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!profile.isSuperAdmin) redirect("/")

  const [users, tenantRows] = await Promise.all([
    loadDirectoryUsers(),
    prisma.tenant.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        departments: {
          select: {
            id: true,
            name: true,
            subDepartments: { select: { id: true, name: true }, orderBy: { name: "asc" } },
          },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
  ])

  // Super admins are managed on the Administrators page; this directory covers
  // the tenant-scoped users only.
  const nonAdminUsers = users.filter((u) => !u.isSuperAdmin)
  const tenants: InviteTenant[] = tenantRows

  return <PlatformUsers users={nonAdminUsers} tenants={tenants} currentUserId={profile.id} />
}
