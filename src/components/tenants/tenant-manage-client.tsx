"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { TenantAvatar } from "@/components/tenants/tenant-avatar"
import { UserAvatar } from "@/components/ui/user-avatar"
import { TENANT_TYPES, tenantTypeLabel } from "@/lib/tenant-types"
import type { TenantBranding } from "@/lib/tenant-branding"

type TenantInfo = {
  id: string
  slug: string
  name: string
  type: string
  status: string
  departments: number
  members: number
}

type Member = {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  role: string
}

const MEMBER_ROLES = ["admin", "manager", "lead", "staff"] as const
const roleLabel = (r: string) => (r === "admin" ? "Tenant admin" : r.charAt(0).toUpperCase() + r.slice(1))

export function TenantManageClient({
  tenant,
  initialBranding,
  initialMembers,
  departments,
}: {
  tenant: TenantInfo
  initialBranding: TenantBranding
  initialMembers: Member[]
  departments: { id: string; name: string }[]
}) {
  const [displayName, setDisplayName] = useState(initialBranding.displayName ?? "")
  const [logoUrl, setLogoUrl] = useState(initialBranding.logoUrl ?? "")
  const [type, setType] = useState(tenant.type)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Members
  const [members, setMembers] = useState<Member[]>(initialMembers)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<string>("staff")
  const [selectedDepts, setSelectedDepts] = useState<string[]>([])
  const [addingMember, setAddingMember] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)

  const previewName = displayName.trim() || tenant.name
  const needsDepartments = inviteRole !== "admin"

  function toggleDept(id: string) {
    setSelectedDepts((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]))
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault()
    const email = inviteEmail.trim()
    if (!email) return
    if (needsDepartments && selectedDepts.length === 0) {
      setError("Select at least one department for a manager, lead, or staff member.")
      return
    }
    setAddingMember(true)
    setError(null)
    setStatus(null)
    setInviteLink(null)
    const res = await fetch(`/api/admin/tenants/${tenant.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        role: inviteRole,
        departmentIds: needsDepartments ? selectedDepts : [],
      }),
    })
    const body = await res.json().catch(() => ({}))
    setAddingMember(false)
    if (!res.ok) {
      setError(body.error ?? "Failed to add member")
      return
    }
    setInviteEmail("")
    setSelectedDepts([])
    if (body.added && body.member) {
      setMembers((prev) => {
        const rest = prev.filter((m) => m.id !== body.member.id)
        return [...rest, body.member]
      })
      setStatus(`${body.member.name || body.member.email} added as ${roleLabel(inviteRole)}.`)
    } else if (body.invited) {
      setInviteLink(body.acceptPath)
      setStatus(`Invitation created for ${body.email}. Share the link below.`)
    }
  }

  async function removeMember(userId: string) {
    setError(null)
    setStatus(null)
    const res = await fetch(`/api/admin/tenants/${tenant.id}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? "Failed to remove member")
      return
    }
    setMembers((prev) => prev.filter((m) => m.id !== userId))
  }

  async function uploadLogo(file: File) {
    setUploading(true)
    setError(null)
    setStatus(null)
    const form = new FormData()
    form.append("file", file)
    const res = await fetch(`/api/admin/tenants/${tenant.id}/logo`, { method: "POST", body: form })
    setUploading(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? "Logo upload failed")
      return
    }
    const body = await res.json()
    setLogoUrl(body.url)
    setStatus("Logo uploaded.")
  }

  async function saveBranding(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setStatus(null)
    const res = await fetch(`/api/admin/tenants/${tenant.id}/branding`, {
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
      setError(body.error ?? "Failed to save branding")
      return
    }
    setStatus("Branding saved.")
  }

  async function changeType(next: string) {
    setType(next)
    setError(null)
    const res = await fetch(`/api/admin/tenants/${tenant.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: next }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? "Failed to update type")
    }
  }

  async function enterTenant() {
    const res = await fetch("/api/active-tenant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: tenant.id }),
    })
    if (res.ok) window.location.href = "/departments"
  }

  const sectionCard = "rounded-xl border border-pen-card-border bg-pen-card p-4 shadow-pen-card"
  const labelClass = "block font-sans text-[12.5px] font-medium text-pen-foreground"

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Link
        href="/tenants"
        className="inline-flex items-center gap-1 font-sans text-[12.5px] text-pen-muted transition-colors hover:text-pen-foreground"
      >
        <ArrowLeft className="size-3.5" />
        All tenants
      </Link>

      {/* Header */}
      <header className="mt-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <TenantAvatar
            name={tenant.name}
            logoUrl={logoUrl.trim() || null}
            size={44}
          />
          <div>
            <h1 className="pen-text-page-title leading-none">{tenant.name}</h1>
            <div className="mt-1 font-sans text-[11.5px] text-pen-subtle">
              /{tenant.slug} · {tenant.departments} dept{tenant.departments === 1 ? "" : "s"} ·{" "}
              {tenant.members} member{tenant.members === 1 ? "" : "s"}
            </div>
          </div>
        </div>
        <Button size="lg" onClick={enterTenant}>
          Enter tenant
        </Button>
      </header>

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12.5px] text-destructive">
          {error}
        </div>
      )}
      {status && (
        <div className="mt-4 rounded-lg border border-pen-green/30 bg-pen-green/10 px-3 py-2 font-sans text-[12.5px] text-pen-green">
          {status}
        </div>
      )}

      {/* Type */}
      <section className={cn("mt-6", sectionCard)}>
        <h2 className="font-sans text-[12.5px] font-semibold text-pen-foreground">Type</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {TENANT_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => changeType(t)}
              className={cn(
                "pen-pressable rounded-full border px-3 py-1 font-sans text-[12.5px] transition-colors",
                type === t
                  ? "border-pen-blue bg-pen-blue-tint font-medium text-pen-blue"
                  : "border-pen-card-border text-pen-muted hover:text-pen-foreground",
              )}
            >
              {tenantTypeLabel(t)}
            </button>
          ))}
        </div>
      </section>

      {/* Branding editor + live preview */}
      <section className="mt-6 grid gap-4 md:grid-cols-[1fr_260px]">
        <form onSubmit={saveBranding} className={cn("space-y-4", sectionCard)}>
          <h2 className="font-sans text-[12.5px] font-semibold text-pen-foreground">Logo &amp; name</h2>

          <div>
            <label className={labelClass}>Display name</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={tenant.name}
              className="mt-1 h-9"
            />
          </div>

          <div>
            <label className={labelClass}>Logo</label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.svg"
                className="h-9"
              />
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="relative shrink-0"
                disabled={uploading}
              >
                {uploading ? "Uploading…" : "Upload"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void uploadLogo(f)
                    e.target.value = ""
                  }}
                />
              </Button>
            </div>
            <p className="mt-1 font-sans text-[11px] text-pen-subtle">
              Paste a URL or upload an image (≤5 MB).
            </p>
          </div>

          <Button type="submit" size="lg" disabled={saving}>
            {saving ? "Saving…" : "Save branding"}
          </Button>
        </form>

        {/* Live preview — how the tenant's logo + name appear in the sidebar. */}
        <div className={sectionCard}>
          <h2 className="font-sans text-[12.5px] font-semibold text-pen-foreground">Preview</h2>
          <div className="mt-3 rounded-lg border border-pen-card-border p-3">
            <div className="flex items-center gap-2">
              <TenantAvatar name={tenant.name} logoUrl={logoUrl.trim() || null} size={32} />
              <span className="truncate font-sans text-[13px] font-semibold text-pen-foreground">
                {previewName}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Members */}
      <section className={cn("mt-6", sectionCard)}>
        <div className="flex items-center justify-between">
          <h2 className="font-sans text-[12.5px] font-semibold text-pen-foreground">Members</h2>
          <span className="font-sans text-[11.5px] text-pen-subtle">
            {members.length} member{members.length === 1 ? "" : "s"}
          </span>
        </div>

        {/* Add or invite */}
        <form onSubmit={addMember} className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Email to add or invite"
              className="h-9 flex-1"
            />
            <Select value={inviteRole} onValueChange={(v) => setInviteRole(v ?? "staff")}>
              <SelectTrigger className="h-9 min-w-[150px]">
                <span className="font-sans text-[12.5px]">{roleLabel(inviteRole)}</span>
              </SelectTrigger>
              <SelectContent>
                {MEMBER_ROLES.map((r) => (
                  <SelectItem key={r} value={r} className="font-sans text-[12.5px]">
                    {roleLabel(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" size="lg" disabled={addingMember || !inviteEmail.trim()}>
              {addingMember ? "Adding…" : "Add member"}
            </Button>
          </div>

          {needsDepartments && (
            <div className="rounded-lg border border-pen-card-border bg-pen-surface p-2.5">
              <p className="font-sans text-[11.5px] font-medium text-pen-foreground">
                {inviteRole === "manager" ? "Manages department(s)" : "Member of department(s)"}
                <span className="ml-1 font-normal text-pen-subtle">— pick one or more</span>
              </p>
              {departments.length === 0 ? (
                <p className="mt-1 font-sans text-[11.5px] text-pen-subtle">
                  This tenant has no departments yet.
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {departments.map((d) => {
                    const on = selectedDepts.includes(d.id)
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleDept(d.id)}
                        className={cn(
                          "pen-pressable rounded-full border px-2.5 py-1 font-sans text-[12px] transition-colors",
                          on
                            ? "border-pen-blue bg-pen-blue-tint font-medium text-pen-blue"
                            : "border-pen-card-border text-pen-muted hover:text-pen-foreground",
                        )}
                      >
                        {d.name}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </form>
        <p className="mt-1 font-sans text-[11px] text-pen-subtle">
          Admins get the whole tenant; managers/leads/staff are scoped to the departments you pick.
          Existing users are added instantly; a new email gets an invitation link.
        </p>

        {inviteLink && (
          <div className="mt-3 rounded-lg border border-pen-card-border bg-pen-surface p-2">
            <p className="font-sans text-[11px] text-pen-muted">Invitation link (share with the invitee):</p>
            <code className="mt-1 block truncate font-mono text-[11.5px] text-pen-foreground">
              {typeof window !== "undefined" ? window.location.origin : ""}
              {inviteLink}
            </code>
          </div>
        )}

        <ul className="mt-4 divide-y divide-pen-card-border">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2">
              <UserAvatar name={m.name} avatarUrl={m.avatarUrl} size={28} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-sans text-[12.5px] font-medium text-pen-foreground">
                  {m.name || m.email}
                </div>
                <div className="truncate font-sans text-[11px] text-pen-subtle">{m.email}</div>
              </div>
              <span className="rounded-full bg-pen-blue-tint px-2 py-0.5 font-sans text-[11px] font-medium text-pen-blue">
                {roleLabel(m.role)}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${m.name || m.email}`}
                onClick={() => removeMember(m.id)}
              >
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
          {members.length === 0 && (
            <li className="py-3 font-sans text-[12px] text-pen-subtle">No members yet.</li>
          )}
        </ul>
      </section>
    </div>
  )
}
