import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { PlatformAdministrators } from "@/components/platform/platform-administrators"

export const dynamic = "force-dynamic"

export default async function PlatformAdministratorsPage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!profile.isSuperAdmin) redirect("/")

  const admins = await prisma.profile.findMany({
    where: { isSuperAdmin: true, deletedAt: null },
    select: { id: true, name: true, email: true, avatarUrl: true },
    orderBy: { name: "asc" },
  })

  return <PlatformAdministrators admins={admins} currentUserId={profile.id} />
}
