import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { loadPlatformUserDirectory } from "@/lib/platform/user-directory"
import { PlatformAdministrators } from "@/components/platform/platform-administrators"
import { PlatformActivityLog } from "@/components/platform/platform-activity-log"
import { loadAuditFilterOptions } from "@/lib/platform/audit-filter-options"

export const dynamic = "force-dynamic"

export default async function PlatformAdministratorsPage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!profile.isSuperAdmin) redirect("/")

  const [users, audit] = await Promise.all([
    loadPlatformUserDirectory(),
    loadAuditFilterOptions(),
  ])
  const admins = users.filter((u) => u.isSuperAdmin)

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PlatformAdministrators admins={admins} currentUserId={profile.id} />
      <div className="px-5 pb-10 sm:px-8 lg:px-12">
        <PlatformActivityLog
          tenants={audit.tenants}
          actors={audit.actors}
          fixedTargetType="Profile"
          title="Administrator audit log"
          description="Immutable record of super-admin grants/revokes and privileged changes. Read-only."
        />
      </div>
    </div>
  )
}
