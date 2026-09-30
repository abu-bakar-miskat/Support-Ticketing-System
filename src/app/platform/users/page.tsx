import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { loadPlatformUserDirectory } from "@/lib/platform/user-directory"
import { PlatformUsers } from "@/components/platform/platform-users"
import type { InviteTenant } from "@/components/platform/platform-invite-member-dialog"

export const dynamic = "force-dynamic"

export default async function PlatformUsersPage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!profile.isSuperAdmin) redirect("/")

  const [users, tenantRows] = await Promise.all([
    loadPlatformUserDirectory(),
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

  // Directory lists everyone; super admins are surfaced with their own filter.
  const members = users
  const tenants: InviteTenant[] = tenantRows

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PlatformUsers users={members} tenants={tenants} currentUserId={profile.id} />
    </div>
  )
}
