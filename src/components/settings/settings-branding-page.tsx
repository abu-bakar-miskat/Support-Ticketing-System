"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { TenantBranding } from "@/lib/tenant-branding"

export function SettingsBrandingPage({
  tenantName,
  initialBranding,
}: {
  tenantName: string
  initialBranding: TenantBranding
}) {
  const [displayName, setDisplayName] = useState(initialBranding.displayName ?? "")
  const [logoUrl, setLogoUrl] = useState(initialBranding.logoUrl ?? "")
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  const labelClass = "block font-sans text-[13px] font-medium text-pen-foreground"

  return (
    <div className="flex flex-col gap-[18px] px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <header className="flex flex-col gap-[3px]">
        <h1 className="pen-text-admin-title">Branding</h1>
        <p className="font-sans text-[13px] text-pen-muted">
          Customize how <span className="font-medium text-pen-foreground">{tenantName}</span> appears
          in the app shell. These settings apply only to this tenant.
        </p>
      </header>

      {error && (
        <div className="w-full max-w-[920px] rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
          {error}
        </div>
      )}
      {status && (
        <div className="w-full max-w-[920px] rounded-lg border border-pen-green/30 bg-pen-green/10 px-3 py-2 font-sans text-[12.5px] text-pen-green">
          {status}
        </div>
      )}

      <section
        className={cn(
          "w-full max-w-[920px] rounded-[10px] border border-pen-card-border bg-pen-card",
          "px-[22px] py-5",
        )}
      >
        <form onSubmit={save} className="flex flex-col gap-5">
          <div className="flex flex-col gap-[5px]">
            <label className={labelClass}>Display name</label>
            <p className="font-sans text-[12px] text-pen-muted">
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
            <label className={labelClass}>Logo URL</label>
            <p className="font-sans text-[12px] text-pen-muted">
              Absolute (https://…) or root-relative (/…) image URL.
            </p>
            <Input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.svg"
              className="mt-1 h-9"
            />
          </div>

          <Button type="submit" size="lg" disabled={saving} className="w-fit">
            {saving ? "Saving…" : "Save branding"}
          </Button>
        </form>
      </section>
    </div>
  )
}
