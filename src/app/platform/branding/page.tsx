import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { getPlatformSettings } from "@/lib/platform-settings"
import { PlatformBrandingPage } from "@/components/platform/platform-branding-page"

export const dynamic = "force-dynamic"

export const metadata = { title: "Branding — Global Support Portal" }

export default async function PlatformBrandingRoute() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!profile.isSuperAdmin) redirect("/")

  const settings = await getPlatformSettings()

  return <PlatformBrandingPage sidebarGroupColors={settings.sidebarGroupColors} />
}
