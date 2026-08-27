"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { UserPlus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { toast } from "sonner"
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
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<string>("agent")
  const [selectedDepts, setSelectedDepts] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)

  const needsDepartments = role !== "admin"

  function reset() {
    setEmail("")
    setRole("agent")
    setSelectedDepts([])
    setError(null)
    setInviteLink(null)
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
      toast.success(`${body.member?.name || value} added as ${roleLabel(role)}.`)
      setOpen(false)
      // Reflect the new member/stat counts without a full reload (keeps the toast alive).
      router.refresh()
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
          "flex items-center gap-1.5 rounded-lg border border-sts-card-border bg-sts-surface px-3 py-1.5 font-sans text-[12px] text-sts-muted transition-colors hover:border-sts-blue/40 hover:text-sts-foreground",
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
            className="w-full max-w-md rounded-2xl border border-sts-card-border bg-sts-bg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-sts-card-border px-5 py-3.5">
              <h2 className="font-sans text-[14px] font-semibold text-sts-foreground">Invite member</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-sts-muted hover:text-sts-foreground"
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

              <div>
                <label className="block font-sans text-[12px] font-medium text-sts-foreground">Email</label>
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
                <label className="block font-sans text-[12px] font-medium text-sts-foreground">Role</label>
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
                  <label className="block font-sans text-[12px] font-medium text-sts-foreground">
                    {role === "manager" ? "Manages department(s)" : "Member of department(s)"}
                    <span className="ml-1 font-normal text-sts-subtle">— pick one or more</span>
                  </label>
                  {departments.length === 0 ? (
                    <p className="mt-1 font-sans text-[11.5px] text-sts-subtle">No departments yet.</p>
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
                              "sts-pressable rounded-full border px-2.5 py-1 font-sans text-[12px] transition-colors",
                              on
                                ? "border-sts-blue bg-sts-blue-tint font-medium text-sts-blue"
                                : "border-sts-card-border text-sts-muted hover:text-sts-foreground",
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
                <div className="rounded-lg border border-sts-card-border bg-sts-surface p-2.5">
                  <p className="font-sans text-[11px] text-sts-muted">Invitation link (share with the invitee):</p>
                  <code className="mt-1 block truncate font-mono text-[11.5px] text-sts-foreground">
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
