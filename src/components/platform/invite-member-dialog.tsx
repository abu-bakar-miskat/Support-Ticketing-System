"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Copy, UserPlus, X } from "lucide-react"
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
  initialDeptIds,
  triggerLabel = "Invite member",
}: {
  tenantId: string
  departments: { id: string; name: string; subDepartments?: { id: string; name: string }[] }[]
  triggerClassName?: string
  /** Departments pre-selected when the dialog opens — e.g. inviting from a specific department card. */
  initialDeptIds?: string[]
  /** Text shown on the trigger button. */
  triggerLabel?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<string>("agent")
  // Managers can manage several departments (multi-select pills).
  const [selectedDepts, setSelectedDepts] = useState<string[]>(initialDeptIds ?? [])
  // Sub-managers/agents join a single sub-department: pick a department, then a
  // sub-department under it.
  const [deptId, setDeptId] = useState<string>(initialDeptIds?.[0] ?? "")
  const [subDeptId, setSubDeptId] = useState<string>("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const fullInviteLink =
    inviteLink && typeof window !== "undefined" ? `${window.location.origin}${inviteLink}` : inviteLink ?? ""

  const copyInviteLink = async () => {
    if (!fullInviteLink) return
    try {
      await navigator.clipboard.writeText(fullInviteLink)
      setCopied(true)
      toast.success("Invite link copied")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Couldn't copy — copy it manually")
    }
  }

  const needsDepartments = role !== "admin"
  // sub_manager/agent join at sub-department level, never the department itself.
  const needsSubDepartment = role === "sub_manager" || role === "agent"
  const subDeptOptions = departments.find((d) => d.id === deptId)?.subDepartments ?? []

  function reset() {
    setEmail("")
    setRole("agent")
    setSelectedDepts(initialDeptIds ?? [])
    setDeptId(initialDeptIds?.[0] ?? "")
    setSubDeptId("")
    setError(null)
    setInviteLink(null)
  }

  function toggleDept(id: string) {
    setSelectedDepts((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]))
  }

  // Switching the department invalidates any sub-department picked under the old one.
  function chooseDept(id: string) {
    setDeptId(id)
    setSubDeptId("")
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = email.trim()
    if (!value) return

    let departmentIds: string[] = []
    let subDepartmentId: string | null = null
    if (needsSubDepartment) {
      if (!deptId) {
        setError("Select a department.")
        return
      }
      if (!subDeptId) {
        setError("Select a sub-department.")
        return
      }
      departmentIds = [deptId]
      subDepartmentId = subDeptId
    } else if (needsDepartments) {
      if (selectedDepts.length === 0) {
        setError("Select at least one department for a manager.")
        return
      }
      departmentIds = selectedDepts
    }

    setBusy(true)
    setError(null)
    setInviteLink(null)
    const res = await fetch(`/api/admin/tenants/${tenantId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: value, role, departmentIds, subDepartmentId }),
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
          "flex items-center gap-1.5 rounded-full border border-sts-card-border bg-sts-surface px-3 py-1.5 font-sans text-[12px] text-sts-muted transition-colors hover:border-sts-blue/40 hover:text-sts-foreground",
          triggerClassName,
        )}
      >
        <UserPlus className="size-3.5" />
        {triggerLabel}
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
                className="rounded-full p-1 text-sts-muted hover:text-sts-foreground"
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

              {/* Manager: manages one or more whole departments (multi-select). */}
              {needsDepartments && !needsSubDepartment && (
                <div>
                  <label className="block font-sans text-[12px] font-medium text-sts-foreground">
                    Manages department(s)
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

              {/* Sub-manager / agent: pick a department, then a sub-department under it. */}
              {needsSubDepartment && (
                <>
                  <div>
                    <label className="block font-sans text-[12px] font-medium text-sts-foreground">Department</label>
                    {departments.length === 0 ? (
                      <p className="mt-1 font-sans text-[11.5px] text-sts-subtle">No departments yet.</p>
                    ) : (
                      <Select value={deptId} onValueChange={(v) => chooseDept(v ?? "")}>
                        <SelectTrigger className="mt-1 h-9 w-full">
                          <span className="font-sans text-[12.5px]">
                            {departments.find((d) => d.id === deptId)?.name ?? "Select a department"}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {departments.map((d) => (
                            <SelectItem key={d.id} value={d.id} className="font-sans text-[12.5px]">
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div>
                    <label className="block font-sans text-[12px] font-medium text-sts-foreground">Sub-department</label>
                    <Select
                      value={subDeptId}
                      onValueChange={(v) => setSubDeptId(v ?? "")}
                      disabled={!deptId || subDeptOptions.length === 0}
                    >
                      <SelectTrigger className="mt-1 h-9 w-full">
                        <span className="font-sans text-[12.5px]">
                          {subDeptOptions.find((s) => s.id === subDeptId)?.name ??
                            (!deptId
                              ? "Select a department first"
                              : subDeptOptions.length === 0
                                ? "No sub-departments"
                                : "Select a sub-department")}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {subDeptOptions.map((s) => (
                          <SelectItem key={s.id} value={s.id} className="font-sans text-[12.5px]">
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {inviteLink ? (
                <div className="rounded-lg border border-sts-card-border bg-sts-surface p-2.5">
                  <p className="font-sans text-[11px] text-sts-muted">Invitation link (share with the invitee):</p>
                  <div className="mt-1 flex items-start gap-2">
                    <code className="min-w-0 flex-1 break-all font-mono text-[11.5px] text-sts-foreground">
                      {fullInviteLink}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={copyInviteLink}
                      className="shrink-0 gap-1.5"
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Copied" : "Copy link"}
                    </Button>
                  </div>
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
