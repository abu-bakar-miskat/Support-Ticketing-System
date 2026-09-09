import { getProfile } from "@/lib/profile"
import { OnboardingPage } from "@/components/onboarding/onboarding-page"

export default async function Page() {
  const profile = await getProfile()
  if (!profile) return null

  // Onboarding is invite-only: a user with no workspace membership is simply
  // asked to contact their tenant/department manager for an invite link, so the
  // page needs nothing beyond their own name.
  return <OnboardingPage userName={profile.name} />
}
