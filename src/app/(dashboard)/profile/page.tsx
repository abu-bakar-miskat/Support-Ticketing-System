import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { ProfileStatsPage } from "@/components/profile/profile-stats-page"
import { fetchProfileStats } from "@/lib/profile-stats"
import { ProfileStatsSkeleton } from "@/components/skeletons/page-skeletons"

export const metadata = { title: "My Profile — Support Ticketing System" }

async function ProfileData({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const profile = await getProfile()
  if (!profile) redirect("/login")

  const sp = await searchParams
  const isPrivileged = ["admin", "manager", "sub_manager"].includes(profile.role)

  const targetId = isPrivileged ? (sp.userId ?? profile.id) : profile.id
  const projectId = sp.projectId || undefined
  const days = parseInt(sp.days ?? "30", 10)

  const to = new Date()
  const from =
    days === 0
      ? (() => {
          const start = new Date()
          start.setHours(0, 0, 0, 0)
          return start
        })()
      : new Date(Date.now() - days * 86400_000)

  const result = await fetchProfileStats({
    viewer: profile,
    targetId,
    fromDate: from,
    toDate: to,
    projectId,
  })

  if (!result.ok) {
    if (result.status === 403) redirect("/profile")
    redirect("/profile")
  }

  return (
    <ProfileStatsPage
      initialData={result.data}
      isPrivileged={isPrivileged}
      currentUserId={profile.id}
    />
  )
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const profile = await getProfile()
  if (!profile) redirect("/login")

  return (
    <Suspense fallback={<ProfileStatsSkeleton />}>
      <ProfileData searchParams={searchParams} />
    </Suspense>
  )
}
