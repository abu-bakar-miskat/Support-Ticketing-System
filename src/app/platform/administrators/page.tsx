import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { loadPlatformUserDirectory } from "@/lib/platform/user-directory"
import { PlatformAdministrators } from "@/components/platform/platform-administrators"

export const dynamic = "force-dynamic"

export default async function PlatformAdministratorsPage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!profile.isSuperAdmin) redirect("/")

  const users = await loadPlatformUserDirectory()
  const admins = users.filter((u) => u.isSuperAdmin)

  return <PlatformAdministrators admins={admins} currentUserId={profile.id} />
}
