"use client"

import { useState } from "react"
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

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold">Branding</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Customize how <span className="font-medium">{tenantName}</span> appears in the app shell.
        These settings apply only to this tenant.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {status && (
        <div className="mt-4 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">{status}</div>
      )}

      <form onSubmit={save} className="mt-6 space-y-5">
        <div>
          <label className="block text-sm font-medium">Display name</label>
          <p className="text-xs text-muted-foreground">Shown in the sidebar (falls back to the tenant name).</p>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={tenantName}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Logo URL</label>
          <p className="text-xs text-muted-foreground">Absolute (https://…) or root-relative (/…) image URL.</p>
          <input
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://example.com/logo.svg"
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save branding"}
        </button>
      </form>
    </div>
  )
}
