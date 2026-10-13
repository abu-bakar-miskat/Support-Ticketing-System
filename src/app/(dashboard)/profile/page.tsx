import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { ProfileStatsPage } from "@/components/profile/profile-stats-page"
import { fetchProfileStats } from "@/lib/profile-stats"
import { ProfileStatsSkeleton } from "@/components/skeletons/page-skeletons"
import { ProfileSlaPerformance, ProfileSlaPerformanceSkeleton } from "@/components/profile/profile-sla-performance"
import { loadPersonPerformance } from "@/lib/reporting/performance-overview"
import { runAsSystem } from "@/lib/request-scope"

export const metadata = { title: "My Profile — Global Support Portal" }

/** Per-ticket SLA evaluation is slow, so this streams in after the main stats.
 * Only rendered once fetchProfileStats has authorised the viewer for targetId. */
async function ProfileSlaData(props: {
  targetId: string
  targetName: string
  from: Date
  to: Date
  projectId?: string
}) {
  const { summary, details } = await runAsSystem(() =>
    loadPersonPerformance(props.targetId, props.targetName, props.from, props.to, props.projectId),
  )
  return <ProfileSlaPerformance summary={summary} details={details} />
}

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
    // A forbidden/not-found request for *someone else's* profile falls back to
    // the viewer's own paramless profile. But when the viewer's OWN profile
    // fails (targetId === profile.id, e.g. a missing Profile row → 404) we are
    // already at that paramless URL — redirecting to "/profile" again would
    // reload-loop forever — so surface a 404 instead.
    if (sp.userId && sp.userId !== profile.id) redirect("/profile")
    notFound()
  }

  return (
    <ProfileStatsPage
      initialData={result.data}
      isPrivileged={isPrivileged}
      currentUserId={profile.id}
      slaSection={
        <Suspense fallback={<ProfileSlaPerformanceSkeleton />}>
          <ProfileSlaData
            targetId={targetId}
            targetName={result.data.profile.name}
            from={from}
            to={to}
            projectId={projectId}
          />
        </Suspense>
      }
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
