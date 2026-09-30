import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { loadPlatformUserDirectory } from "@/lib/platform/user-directory"
import { PlatformUsers } from "@/components/platform/platform-users"
import { PlatformActivityLog } from "@/components/platform/platform-activity-log"
import { loadAuditFilterOptions } from "@/lib/platform/audit-filter-options"
import type { InviteTenant } from "@/components/platform/platform-invite-member-dialog"

export const dynamic = "force-dynamic"

export default async function PlatformUsersPage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!profile.isSuperAdmin) redirect("/")

  const [users, tenantRows, audit] = await Promise.all([
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
    loadAuditFilterOptions(),
  ])

  // Directory lists everyone; super admins are surfaced with their own filter.
  const members = users
  const tenants: InviteTenant[] = tenantRows

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PlatformUsers users={members} tenants={tenants} currentUserId={profile.id} />
      <div className="px-5 pb-10 sm:px-8 lg:px-12">
        <PlatformActivityLog
          tenants={audit.tenants}
          actors={audit.actors}
          fixedTargetType="Profile"
          title="User & permission audit log"
          description="Immutable record of privileged user changes — admin grant/revoke, role changes, activation, and deletion. Read-only."
        />
      </div>
    </div>
  )
}
