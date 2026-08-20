"use client"

import { useState } from "react"
import { UserPlus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { cn } from "@/lib/utils"

const MEMBER_ROLES = ["admin", "manager", "sub_manager", "agent"] as const
const roleLabel = (r: string) =>
  r === "admin"
    ? "Admin (whole tenant)"
    : r === "sub_manager"
      ? "Sub-manager"
      : r.charAt(0).toUpperCase() + r.slice(1)

/**
 * Add-or-invite a member to a tenant. Existing users are added instantly; a new
 * email gets an invitation link. Admins get the whole tenant; managers/leads/
 * staff are scoped to the departments picked.
 */
export function InviteMemberDialog({
  tenantId,
  departments,
  triggerClassName,
}: {
  tenantId: string
  departments: { id: string; name: string }[]
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<string>("agent")
  const [selectedDepts, setSelectedDepts] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [added, setAdded] = useState<string | null>(null)

  const needsDepartments = role !== "admin"

  function reset() {
    setEmail("")
    setRole("agent")
    setSelectedDepts([])
    setError(null)
    setInviteLink(null)
    setAdded(null)
  }

  function toggleDept(id: string) {
    setSelectedDepts((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = email.trim()
    if (!value) return
    if (needsDepartments && selectedDepts.length === 0) {
      setError("Select at least one department for a manager, lead, or staff member.")
      return
    }
    setBusy(true)
    setError(null)
    setInviteLink(null)
    setAdded(null)
    const res = await fetch(`/api/admin/tenants/${tenantId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: value, role, departmentIds: needsDepartments ? selectedDepts : [] }),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setError(body.error ?? "Failed to add member")
      return
    }
    if (body.added) {
      setAdded(`${body.member?.name || value} added as ${roleLabel(role)}.`)
      // Reflect the new member/stat counts.
      setTimeout(() => window.location.reload(), 700)
    } else if (body.invited) {
      setInviteLink(body.acceptPath)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset()
          setOpen(true)
        }}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border border-pen-card-border bg-pen-surface px-3 py-1.5 font-sans text-[12px] text-pen-muted transition-colors hover:border-pen-blue/40 hover:text-pen-foreground",
          triggerClassName,
        )}
      >
        <UserPlus className="size-3.5" />
        Invite member
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-pen-card-border bg-pen-bg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-pen-card-border px-5 py-3.5">
              <h2 className="font-sans text-[14px] font-semibold text-pen-foreground">Invite member</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-pen-muted hover:text-pen-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={submit} className="space-y-3 px-5 py-4">
              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-sans text-[12px] text-destructive">
                  {error}
                </div>
              )}
              {added && (
                <div className="rounded-lg border border-pen-green/30 bg-pen-green/10 px-3 py-2 font-sans text-[12px] text-pen-green">
                  {added}
                </div>
              )}

              <div>
                <label className="block font-sans text-[12px] font-medium text-pen-foreground">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="person@example.com"
                  className="mt-1 h-9"
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-sans text-[12px] font-medium text-pen-foreground">Role</label>
                <Select value={role} onValueChange={(v) => setRole(v ?? "agent")}>
                  <SelectTrigger className="mt-1 h-9 w-full">
                    <span className="font-sans text-[12.5px]">{roleLabel(role)}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {MEMBER_ROLES.map((r) => (
                      <SelectItem key={r} value={r} className="font-sans text-[12.5px]">
                        {roleLabel(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {needsDepartments && (
                <div>
                  <label className="block font-sans text-[12px] font-medium text-pen-foreground">
                    {role === "manager" ? "Manages department(s)" : "Member of department(s)"}
                    <span className="ml-1 font-normal text-pen-subtle">— pick one or more</span>
                  </label>
                  {departments.length === 0 ? (
                    <p className="mt-1 font-sans text-[11.5px] text-pen-subtle">No departments yet.</p>
                  ) : (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
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

              {inviteLink ? (
                <div className="rounded-lg border border-pen-card-border bg-pen-surface p-2.5">
                  <p className="font-sans text-[11px] text-pen-muted">Invitation link (share with the invitee):</p>
                  <code className="mt-1 block truncate font-mono text-[11.5px] text-pen-foreground">
                    {typeof window !== "undefined" ? window.location.origin : ""}
                    {inviteLink}
                  </code>
                </div>
              ) : (
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" size="lg" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="lg" disabled={busy || !email.trim()}>
                    {busy ? "Adding…" : "Add member"}
                  </Button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  )
}
