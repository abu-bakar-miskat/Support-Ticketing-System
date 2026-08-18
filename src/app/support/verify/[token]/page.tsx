import { CheckCircle2, Clock, XCircle } from "lucide-react"
import { finalizePendingIntake } from "@/lib/intake-finalize"
import { getEmailConfig, brandingFrom } from "@/lib/email-config"

export const dynamic = "force-dynamic"

export const metadata = { title: "Confirm your request" }

export default async function VerifyIntakePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const result = await finalizePendingIntake(token)
  // DS-01: department branding for this customer-facing confirmation page.
  const brand = brandingFrom(await getEmailConfig(result.departmentId))

  const success = result.status === "created" || result.status === "already"
  const humanId = success ? result.humanId : null

  const heading = success
    ? "You're all set"
    : result.status === "expired"
      ? "This link has expired"
      : result.status === "notfound"
        ? "This link is no longer valid"
        : "Something went wrong"

  const message = success
    ? "Your request is confirmed — someone from the PEN team will be in touch."
    : result.status === "expired"
      ? "Confirmation links are valid for 24 hours. Please submit your request again to get a fresh link."
      : result.status === "notfound"
        ? "This confirmation link is invalid or has already been used. If you've already confirmed, no further action is needed."
        : "We couldn't confirm your request just now. Please open the link in your email again, or resubmit your request."

  const Icon = success ? CheckCircle2 : result.status === "expired" ? Clock : XCircle

  return (
    <main className="pen-light-scope flex min-h-screen flex-col bg-pen-bg">
      {brand.logoUrl && (
        <div style={{ background: brand.headerColor }} className="w-full px-4 py-5 sm:px-6">
          <div className="mx-auto flex max-w-2xl items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brand.logoUrl} alt="PEN" className="h-9 w-auto" />
          </div>
        </div>
      )}

      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-md rounded-2xl border border-pen-card-border bg-pen-card px-8 py-12 text-center shadow-sm">
          <div
            className={`mx-auto mb-5 flex size-14 items-center justify-center rounded-full ${
              success ? "bg-green-50" : result.status === "expired" ? "bg-amber-50" : "bg-red-50"
            }`}
          >
            <Icon
              className={`size-7 ${
                success ? "text-green-500" : result.status === "expired" ? "text-amber-500" : "text-red-400"
              }`}
              strokeWidth={2}
            />
          </div>

          <h1 className="font-poppins text-[22px] font-semibold text-pen-foreground">{heading}</h1>
          <p className="mx-auto mt-2 max-w-sm font-poppins text-[13px] leading-relaxed text-pen-muted">
            {message}
          </p>

          {success && humanId && (
            <div className="mt-6 flex flex-col items-center gap-1.5">
              <span className="font-poppins text-[11px] font-semibold uppercase tracking-wide text-pen-subtle">
                Ticket number
              </span>
              <span className="rounded-md border border-pen-card-border bg-pen-surface px-3 py-1.5 font-mono text-[14px] font-medium text-pen-foreground">
                {humanId}
              </span>
              <span className="font-poppins text-[11px] text-pen-subtle">
                Please quote this in any follow-up.
              </span>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
