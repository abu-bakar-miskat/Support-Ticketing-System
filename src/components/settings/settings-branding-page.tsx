"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { TenantBranding } from "@/lib/tenant-branding"
import { EmailIdentityCard } from "./settings-email-identity"
import { LogoUploadButton } from "./logo-upload-button"
import type { DeptOption } from "./settings-email-templates-page"

export function SettingsBrandingPage({
  tenantName,
  initialBranding,
  departments = [],
}: {
  tenantName: string
  initialBranding: TenantBranding
  departments?: DeptOption[]
}) {
  const [displayName, setDisplayName] = useState(initialBranding.displayName ?? "")
  const [logoUrl, setLogoUrl] = useState(initialBranding.logoUrl ?? "")
  const [hideLogo, setHideLogo] = useState(initialBranding.hideLogo ?? false)
  // Default on (logo fills the width) unless the tenant explicitly turned it off.
  const [hideDisplayName, setHideDisplayName] = useState(
    initialBranding.hideDisplayName ?? !initialBranding.hideLogo,
  )
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scopeKeyOf = (d: DeptOption) => `${d.id}::${d.subDepartmentId ?? ""}`
  const [scopeKey, setScopeKey] = useState<string>(departments[0] ? scopeKeyOf(departments[0]) : "")
  const selectedScope = departments.find((d) => scopeKeyOf(d) === scopeKey) ?? departments[0]

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setStatus(null)
    const res = await fetch("/api/admin/tenant-branding", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: displayName.trim() || undefined,
        logoUrl: logoUrl.trim() || undefined,
        hideLogo,
        hideDisplayName,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? "Failed to save")
      return
    }
    setStatus("Branding saved.")
    // Re-render the server shell layout so the sidebar header picks up the change.
    router.refresh()
  }

  const labelClass = "block font-sans text-[13px] font-medium text-sts-foreground"

  return (
    <div className="flex flex-col gap-[18px] px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <header className="flex flex-col gap-[3px]">
        <h1 className="sts-text-admin-title">Branding</h1>
        <p className="font-sans text-[13px] text-sts-muted">
          Customize how <span className="font-medium text-sts-foreground">{tenantName}</span> appears
          in the app shell. These settings apply only to this tenant.
        </p>
      </header>

      {error && (
        <div className="w-full max-w-[920px] rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
          {error}
        </div>
      )}
      {status && (
        <div className="w-full max-w-[920px] rounded-lg border border-sts-green/30 bg-sts-green/10 px-3 py-2 font-sans text-[12.5px] text-sts-green">
          {status}
        </div>
      )}

      <section
        className={cn(
          "w-full max-w-[920px] rounded-[6px] border border-sts-card-border bg-sts-card",
          "px-[22px] py-5",
        )}
      >
        <form onSubmit={save} className="flex flex-col gap-5">
          <div className="flex flex-col gap-[5px]">
            <label className={labelClass}>Display name</label>
            <p className="font-sans text-[12px] text-sts-muted">
              Shown in the sidebar (falls back to the tenant name).
            </p>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={tenantName}
              className="mt-1 h-9"
            />
          </div>

          <div className="flex flex-col gap-[5px]">
            <label className={labelClass}>Logo</label>
            <p className="font-sans text-[12px] text-sts-muted">
              Upload an image or paste an absolute (https://…) or root-relative (/…) URL.
            </p>

            <div className="mt-1 flex items-center gap-3">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt="Logo preview"
                  className="h-20 w-40 shrink-0 rounded-md border border-sts-card-border object-contain bg-sts-surface p-2"
                />
              ) : (
                <div className="flex h-20 w-40 shrink-0 items-center justify-center rounded-md border border-dashed border-sts-card-border text-[11px] text-sts-muted">
                  Logo
                </div>
              )}

              <LogoUploadButton
                onUploaded={(url) => {
                  setLogoUrl(url)
                  setError(null)
                  setStatus("Logo uploaded. Click “Save branding” to apply.")
                }}
                onError={(m) => setError(m)}
              />
              {logoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setLogoUrl("")}
                >
                  Remove
                </Button>
              )}
            </div>

            <Input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.svg"
              className="mt-2 h-9"
            />
            <p className="font-sans text-[11px] text-sts-muted">
              PNG, JPG, GIF, WebP, or SVG · up to 5 MB.
            </p>
          </div>

          <div className="flex flex-col gap-2 border-t border-sts-card-border pt-4">
            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={hideLogo}
                onChange={(e) => {
                  setHideLogo(e.target.checked)
                  if (e.target.checked) setHideDisplayName(false)
                }}
                className="size-4 shrink-0 accent-sts-green"
              />
              <span className="font-sans text-[13px] text-sts-foreground">
                Hide logo{" "}
                <span className="text-sts-muted">— the display name fills the width.</span>
              </span>
            </label>
            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={hideDisplayName}
                onChange={(e) => {
                  setHideDisplayName(e.target.checked)
                  if (e.target.checked) setHideLogo(false)
                }}
                className="size-4 shrink-0 accent-sts-green"
              />
              <span className="font-sans text-[13px] text-sts-foreground">
                Hide display name{" "}
                <span className="text-sts-muted">— the logo fills the width.</span>
              </span>
            </label>
          </div>

          <Button type="submit" size="lg" disabled={saving} className="w-fit">
            {saving ? "Saving…" : "Save branding"}
          </Button>
        </form>
      </section>

      {departments.length > 1 ? (
        <div className="flex max-w-[920px] flex-col gap-1.5">
          <label className="sts-text-label">Applies to</label>
          <Select value={scopeKey} onValueChange={(v) => setScopeKey(v ?? (departments[0] ? scopeKeyOf(departments[0]) : ""))}>
            <SelectTrigger className="h-9 w-full max-w-[320px] rounded-full border-sts-card-border bg-sts-bg font-sans text-[12.5px] text-sts-foreground">
              <span>{selectedScope?.name ?? "Select department"}</span>
            </SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={scopeKeyOf(d)} value={scopeKeyOf(d)} className="font-sans text-[12.5px]">
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <EmailIdentityCard scope={selectedScope} />
    </div>
  )
}
