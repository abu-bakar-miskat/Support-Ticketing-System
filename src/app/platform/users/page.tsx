import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { loadPlatformUserDirectory } from "@/lib/platform/user-directory"
import { PlatformUsers } from "@/components/platform/platform-users"

export const dynamic = "force-dynamic"

export default async function PlatformUsersPage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!profile.isSuperAdmin) redirect("/")

  const users = await loadPlatformUserDirectory()
  // Platform Users directory excludes super admins — those live under Administrators.
  const members = users.filter((u) => !u.isSuperAdmin)

  return <PlatformUsers users={members} currentUserId={profile.id} />
}
