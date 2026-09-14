import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
<<<<<<< HEAD
import { loadPlatformUserDirectory } from "@/lib/platform/user-directory"
=======
import { loadDirectoryUsers } from "@/lib/platform/user-directory"
>>>>>>> 93793350d037b4d89b1ccd6ec00eeb5b85222a3e
import { PlatformAdministrators } from "@/components/platform/platform-administrators"

export const dynamic = "force-dynamic"

export default async function PlatformAdministratorsPage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!profile.isSuperAdmin) redirect("/")

<<<<<<< HEAD
  const users = await loadPlatformUserDirectory()
=======
  const users = await loadDirectoryUsers()
>>>>>>> 93793350d037b4d89b1ccd6ec00eeb5b85222a3e
  const admins = users.filter((u) => u.isSuperAdmin)

  return <PlatformAdministrators admins={admins} currentUserId={profile.id} />
}
