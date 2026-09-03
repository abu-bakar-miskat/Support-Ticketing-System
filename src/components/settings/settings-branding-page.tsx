"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { TenantBranding } from "@/lib/tenant-branding"
import { EmailIdentityCard } from "./settings-email-identity"
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
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-selecting the same file
    if (!file) return
    setUploading(true)
    setError(null)
    setStatus(null)
    const body = new FormData()
    body.append("file", file)
    const res = await fetch("/api/admin/tenant-branding", { method: "POST", body })
    setUploading(false)
    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      setError(b.error ?? "Upload failed")
      return
    }
    const { url } = await res.json()
    setLogoUrl(url)
    setStatus("Logo uploaded. Click “Save branding” to apply.")
  }

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
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? "Failed to save")
      return
    }
    setStatus("Saved. Reload to see the shell update.")
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
                  className="h-10 w-10 shrink-0 rounded-md border border-sts-card-border object-contain bg-sts-surface"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-sts-card-border text-[10px] text-sts-muted">
                  Logo
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                onChange={onUpload}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? "Uploading…" : "Upload image"}
              </Button>
              {logoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={uploading}
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

          <Button type="submit" size="lg" disabled={saving} className="w-fit">
            {saving ? "Saving…" : "Save branding"}
          </Button>
        </form>
      </section>

      <EmailIdentityCard departments={departments} />
    </div>
  )
}
