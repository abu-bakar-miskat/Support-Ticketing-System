import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"

export const metadata = { title: "Join a Department — Global Support Portal" }

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await getProfile()
  if (!profile) redirect("/login")

  // Already in a workspace → their role landing, not this empty join screen.
  if (
    profile.role === "admin" ||
    profile.role === "manager" ||
    (profile.memberships?.length ?? 0) > 0 ||
    (profile.tenantMemberships?.length ?? 0) > 0
  ) {
    redirect("/")
  }

  return <>{children}</>
}
