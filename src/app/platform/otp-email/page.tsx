import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"
import { getPlatformSettings } from "@/lib/platform-settings"
import { OTP_DEFAULT } from "@/lib/email-templates/otp"
import { PlatformOtpEmailPage } from "@/components/platform/platform-otp-email-page"

export const dynamic = "force-dynamic"

export const metadata = { title: "OTP email — Global Support Portal" }

export default async function PlatformOtpEmailRoute() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!profile.isSuperAdmin) redirect("/")

  const settings = await getPlatformSettings()

  return (
    <PlatformOtpEmailPage
      otpTemplate={settings.otpEmailTemplate}
      otpDefault={OTP_DEFAULT}
      platformName={settings.platformName}
    />
  )
}
