import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"

export const metadata = { title: "Join a Department — Support Ticketing System" }

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await getProfile()
  if (!profile) redirect("/login")

  // Already has a team membership or is admin/manager → send to dashboard
  if (
    profile.role === "admin" ||
    profile.role === "manager" ||
    (profile.memberships?.length ?? 0) > 0
  ) {
    redirect("/")
  }

  return <>{children}</>
}
