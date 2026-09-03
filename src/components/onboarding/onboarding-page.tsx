"use client"

import { useState, useEffect, useCallback } from "react"
import { Building2, Check, Clock, Users, Loader2, LogOut, RotateCcw, XCircle, Layers } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { BrandIcon } from "@/components/auth/sts-logo"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { UserAvatar } from "@/components/ui/user-avatar"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

function SignOutButton() {
  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = "/login"
  }
  return (
    <button
      type="button"
      onClick={() => void handleSignOut()}
      className="sts-pressable flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-sans text-[12px] text-sts-muted transition-colors hover:bg-sts-surface hover:text-sts-foreground"
    >
      <LogOut className="size-3.5" />
      Sign out
    </button>
  )
}

type SubDepartment = {
  id: string
  name: string
}

type Department = {
  id: string
  name: string
  managers: string[]
  subDepartments: SubDepartment[]
}

type Tenant = {
  id: string
  name: string
  departments: Department[]
}

type Props = {
  tenants: Tenant[]
  pendingKeys: string[]
  userId: string
  userName: string
}

const WHOLE_DEPT = "" // sentinel target: request the whole department

export function OnboardingPage({ tenants, pendingKeys, userId, userName }: Props) {
  const [pending,  setPending]  = useState<Set<string>>(new Set(pendingKeys))
  const [rejected, setRejected] = useState<Set<string>>(new Set())
  const [requesting, setRequesting] = useState<string | null>(null)
  const [approved, setApproved] = useState(false)
  // Per-department chosen sub-department id ("" = whole department)
  const [targets, setTargets] = useState<Record<string, string>>({})

  const handleApproved = useCallback(() => {
    setApproved(true)
    toast.success("You've been approved! Redirecting…")
    setTimeout(() => { window.location.href = "/" }, 1500)
  }, [])

  const handleRejected = useCallback((key: string) => {
    setPending((prev)  => { const n = new Set(prev);  n.delete(key); return n })
    setRejected((prev) => new Set(prev).add(key))
    toast.error("Your request was not approved. You can send a new request anytime.")
  }, [])

  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (supabase.channel(`onboarding-notifs:${userId}`) as any)
      .on("broadcast", { event: "join_request_approved" }, () => {
        handleApproved()
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("broadcast", { event: "join_request_rejected" }, (raw: any) => {
        // Payload carries whichever id the request targeted.
        const key: string = raw?.payload?.subDepartmentId ?? raw?.payload?.departmentId ?? ""
        if (key) handleRejected(key)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, handleApproved, handleRejected])

  async function requestToJoin(deptId: string, subDeptId: string) {
    // The join target is a specific sub-department when chosen, else the dept.
    const key = subDeptId || deptId
    const url = subDeptId
      ? `/api/sub-departments/${subDeptId}/join-requests`
      : `/api/departments/${deptId}/join-requests`

    // If previously rejected, clear that state first
    setRejected((prev) => { const n = new Set(prev); n.delete(key); return n })
    setRequesting(key)
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (res.ok || res.status === 409) {
        setPending((prev) => new Set(prev).add(key))
        if (res.ok) toast.success("Request sent! Waiting for approval…")
      } else {
        toast.error("Failed to send request")
      }
    } catch {
      toast.error("Something went wrong")
    } finally {
      setRequesting(null)
    }
  }

  if (approved) {
    return (
      <main className="sts-ambient-bg relative flex min-h-svh items-center justify-center overflow-hidden font-sans">
        <div className="sts-glass-panel sts-modal-enter flex flex-col items-center gap-4 rounded-2xl border px-10 py-12 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-sts-green/10">
            <Check className="size-8 text-sts-green" strokeWidth={2} />
          </div>
          <p className="sts-text-modal-title">
            You&apos;ve been approved!
          </p>
          <p className="font-sans text-[13px] text-sts-muted">Redirecting to your workspace…</p>
          <Loader2 className="size-5 animate-spin text-sts-muted" />
        </div>
      </main>
    )
  }

  const pendingCount  = pending.size
  const rejectedCount = rejected.size
  const hasDepartments = tenants.some((t) => t.departments.length > 0)

  return (
    <main className="sts-ambient-bg relative flex min-h-svh flex-col font-sans">
      {/* Top bar */}
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between px-5 sm:px-8">
        <BrandIcon className="h-7" />
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto flex w-full max-w-[620px] flex-col gap-6 px-5 pb-16 pt-8 sm:px-0">
        {/* Greeting */}
        <div className="sts-page-enter flex flex-col gap-2">
          <div className="mb-1 flex items-center gap-2.5">
            <UserAvatar name={userName} size={30} />
            <span className="font-sans text-[12.5px] text-sts-muted">
              Signed in as <span className="font-semibold text-sts-foreground">{userName}</span>
            </span>
          </div>
          <h1 className="sts-text-admin-title leading-snug text-balance">
            Join a workspace to get started
          </h1>
          <p className="max-w-[52ch] font-sans text-[13px] leading-relaxed text-sts-muted">
            Pick a department — or a specific sub-department — and request access.
            Once an admin or manager approves, you&apos;ll be redirected
            automatically, no refresh needed.
          </p>
        </div>

        {/* Status banners */}
        {pendingCount > 0 && (
          <div className="sts-page-enter flex items-start gap-3 rounded-xl border border-sts-blue/25 bg-sts-blue-tint px-4 py-3">
            <Clock className="mt-[1px] size-4 shrink-0 text-sts-id" />
            <div className="min-w-0">
              <p className="font-sans text-[12.5px] font-semibold text-sts-id">
                {pendingCount === 1 ? "1 request pending" : `${pendingCount} requests pending`}
              </p>
              <p className="font-sans text-[11.5px] text-sts-id/70">
                This page will redirect automatically once your request is approved.
              </p>
            </div>
          </div>
        )}

        {rejectedCount > 0 && (
          <div className="sts-page-enter flex items-start gap-3 rounded-xl border border-sts-red/20 bg-sts-red-tint px-4 py-3">
            <XCircle className="mt-[1px] size-4 shrink-0 text-sts-red" />
            <div className="min-w-0">
              <p className="font-sans text-[12.5px] font-semibold text-sts-red">
                {rejectedCount === 1 ? "1 request was not approved" : `${rejectedCount} requests were not approved`}
              </p>
              <p className="font-sans text-[11.5px] text-sts-red/70">
                You can send a new request to any department below.
              </p>
            </div>
          </div>
        )}

        {/* Tenant → department → sub-department */}
        {!hasDepartments ? (
          <div className="sts-glass-panel sts-page-enter flex flex-col items-center gap-3 rounded-2xl border py-16 text-center">
            <Building2 className="size-8 text-sts-subtle" strokeWidth={1.2} />
            <div>
              <p className="font-sans text-[13px] font-medium text-sts-muted">No workspaces yet</p>
              <p className="mt-0.5 font-sans text-[11.5px] text-sts-subtle">
                Contact your workspace admin to create one.
              </p>
            </div>
          </div>
        ) : (
          <div className="sts-stagger flex flex-col gap-6">
            {tenants.map((tenant) => {
              if (tenant.departments.length === 0) return null
              return (
                <section key={tenant.id} className="flex flex-col gap-2">
                  {/* Tenant header */}
                  <div className="flex items-center gap-2 px-1">
                    <Building2 className="size-3.5 text-sts-subtle" strokeWidth={1.6} />
                    <h2 className="font-sans text-[11.5px] font-semibold uppercase tracking-wide text-sts-muted">
                      {tenant.name}
                    </h2>
                  </div>

                  {tenant.departments.map((dept) => {
                    const target = targets[dept.id] ?? WHOLE_DEPT
                    const key = target || dept.id
                    const isPending    = pending.has(key)
                    const isRejected   = rejected.has(key)
                    const isRequesting = requesting === key

                    return (
                      <div
                        key={dept.id}
                        className={cn(
                          "sts-glass-panel group flex flex-col gap-3 rounded-2xl border px-5 py-4 transition-all sm:flex-row sm:items-center sm:gap-4",
                          isPending  && "border-sts-blue/25",
                          isRejected && "border-sts-red/20",
                          !isPending && !isRejected && "hover:border-sts-accent/40 hover:shadow-sts-card",
                        )}
                      >
                        {/* Icon */}
                        <div className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-xl border transition-colors",
                          isPending  && "border-sts-blue/20 bg-sts-blue-tint",
                          isRejected && "border-sts-red/20 bg-sts-red-tint",
                          !isPending && !isRejected && "border-sts-card-border bg-sts-surface group-hover:border-sts-accent/25",
                        )}>
                          <Building2
                            className={cn(
                              "size-[18px]",
                              isPending ? "text-sts-id" : isRejected ? "text-sts-red/60" : "text-sts-muted",
                            )}
                            strokeWidth={1.5}
                          />
                        </div>

                        {/* Info + sub-department picker */}
                        <div className="min-w-0 flex-1">
                          <p className="font-sans text-[13px] font-semibold text-sts-foreground">
                            {dept.name}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                            <span className="flex items-center gap-1 font-sans text-[11.5px] text-sts-subtle">
                              <Users className="size-3" />
                              {dept.subDepartments.length} {dept.subDepartments.length === 1 ? "sub-department" : "sub-departments"}
                            </span>
                            {dept.managers.length > 0 && (
                              <>
                                <span className="text-sts-subtle/40">·</span>
                                <span className="font-sans text-[11.5px] text-sts-subtle">
                                  {dept.managers.join(", ")}
                                </span>
                              </>
                            )}
                          </div>

                          {/* Sub-department selector */}
                          {dept.subDepartments.length > 0 && (
                            <label className="mt-2.5 flex items-center gap-2">
                              <span className="flex items-center gap-1 font-sans text-[11px] text-sts-subtle">
                                <Layers className="size-3" />
                                Join
                              </span>
                              <select
                                value={target}
                                onChange={(e) =>
                                  setTargets((prev) => ({ ...prev, [dept.id]: e.target.value }))
                                }
                                disabled={approved}
                                className="min-w-0 flex-1 rounded-lg border border-sts-card-border bg-sts-surface px-2.5 py-1.5 font-sans text-[11.5px] text-sts-foreground transition-colors focus-visible:border-sts-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-accent/40 disabled:opacity-60"
                              >
                                <option value={WHOLE_DEPT}>Whole department</option>
                                {dept.subDepartments.map((sub) => (
                                  <option key={sub.id} value={sub.id}>{sub.name}</option>
                                ))}
                              </select>
                            </label>
                          )}
                        </div>

                        {/* Action */}
                        {isPending ? (
                          <span className="flex shrink-0 items-center gap-1.5 self-start rounded-full border border-sts-blue/20 bg-sts-blue-tint px-3 py-1.5 font-sans text-[11.5px] font-semibold text-sts-id sm:self-auto">
                            <Clock className="size-3" />
                            Pending
                          </span>
                        ) : isRejected ? (
                          <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
                            <span className="flex items-center gap-1 font-sans text-[11.5px] font-semibold text-sts-red/80">
                              <XCircle className="size-3" />
                              Not approved
                            </span>
                            <button
                              type="button"
                              onClick={() => requestToJoin(dept.id, target)}
                              disabled={isRequesting || approved}
                              className="sts-pressable flex items-center gap-1.5 rounded-lg border border-sts-card-border px-3 py-1.5 font-sans text-[11.5px] font-semibold text-sts-foreground transition-colors hover:border-sts-accent/40 hover:bg-sts-surface disabled:opacity-60"
                            >
                              {isRequesting
                                ? <Loader2 className="size-3 animate-spin" />
                                : <RotateCcw className="size-3" />}
                              Request again
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => requestToJoin(dept.id, target)}
                            disabled={isRequesting || approved}
                            className="sts-pressable flex shrink-0 items-center gap-1.5 self-start rounded-lg bg-sts-button px-4 py-2 font-sans text-[11.5px] font-medium text-sts-button-fg transition-colors hover:bg-sts-button/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-accent/60 disabled:opacity-60 sm:self-auto"
                          >
                            {isRequesting
                              ? <Loader2 className="size-3.5 animate-spin" />
                              : <Check className="size-3.5" />}
                            {isRequesting ? "Sending…" : "Request to Join"}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </section>
              )
            })}
          </div>
        )}

        <div className="flex items-center justify-center gap-1.5">
          <span className="size-1.25 shrink-0 rounded-full bg-sts-accent" aria-hidden />
          <p className="text-center font-sans text-[11.5px] text-sts-muted">
            Need help? Contact your workspace administrator.
          </p>
        </div>
      </div>
    </main>
  )
}
