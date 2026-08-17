"use client"

import { useState, useEffect, useCallback } from "react"
import { Building2, Check, Clock, Users, Loader2, LogOut, RotateCcw, XCircle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
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
      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 font-sans text-[12px] text-pen-muted hover:bg-pen-surface hover:text-pen-foreground transition-colors"
    >
      <LogOut className="size-3.5" />
      Sign out
    </button>
  )
}

type Department = {
  id: string
  name: string
  teamCount: number
  managers: string[]
}

type Props = {
  departments: Department[]
  pendingDeptIds: string[]
  userId: string
  userName: string
}

export function OnboardingPage({ departments, pendingDeptIds, userId, userName }: Props) {
  const [pending,  setPending]  = useState<Set<string>>(new Set(pendingDeptIds))
  const [rejected, setRejected] = useState<Set<string>>(new Set())
  const [requesting, setRequesting] = useState<string | null>(null)
  const [approved, setApproved] = useState(false)

  const handleApproved = useCallback(() => {
    setApproved(true)
    toast.success("You've been approved! Redirecting…")
    setTimeout(() => { window.location.href = "/" }, 1500)
  }, [])

  const handleRejected = useCallback((deptId: string) => {
    setPending((prev)  => { const n = new Set(prev);  n.delete(deptId); return n })
    setRejected((prev) => new Set(prev).add(deptId))
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
        const deptId: string = raw?.payload?.departmentId ?? ""
        if (deptId) handleRejected(deptId)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, handleApproved, handleRejected])

  async function requestToJoin(deptId: string) {
    // If previously rejected, clear that state first
    setRejected((prev) => { const n = new Set(prev); n.delete(deptId); return n })
    setRequesting(deptId)
    try {
      const res = await fetch(`/api/departments/${deptId}/join-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (res.ok || res.status === 409) {
        setPending((prev) => new Set(prev).add(deptId))
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
      <div className="flex min-h-svh items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-pen-green/10">
            <Check className="size-8 text-pen-green" strokeWidth={2} />
          </div>
          <p className="pen-text-modal-title">
            You&apos;ve been approved!
          </p>
          <p className="font-sans text-[13px] text-pen-muted">Redirecting to your workspace…</p>
          <Loader2 className="size-5 animate-spin text-pen-muted" />
        </div>
      </div>
    )
  }

  const pendingCount  = pending.size
  const rejectedCount = rejected.size

  return (
    <div className="flex min-h-svh flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between border-b border-pen-card-border bg-pen-card/80 px-5 backdrop-blur-md sm:px-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/pen-logo-light.svg" alt="PEN Group" width={100} height={30} className="h-7 w-auto dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/pen-logo-dark.svg"  alt="PEN Group" width={100} height={30} className="hidden h-7 w-auto dark:block" />
        <SignOutButton />
      </header>

      {/* Gradient backdrop */}
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{ background: "var(--pen-bg-gradient, var(--pen-bg))" }}
        aria-hidden
      />

      {/* Content */}
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-7 px-5 py-14 sm:px-0">
        {/* Greeting */}
        <div className="flex flex-col gap-1.5">
          <div className="mb-2 flex items-center gap-2.5">
            <UserAvatar name={userName} size={30} />
            <span className="font-sans text-[12.5px] text-pen-muted">
              Signed in as <span className="font-semibold text-pen-foreground">{userName}</span>
            </span>
          </div>
          <h1 className="pen-text-admin-title leading-snug">
            Join a department to get started
          </h1>
          <p className="font-sans text-[13px] leading-relaxed text-pen-muted">
            Request access below. Once an admin or manager approves,
            you&apos;ll be redirected automatically — no refresh needed.
          </p>
        </div>

        {/* Status banners */}
        {pendingCount > 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-pen-blue/25 bg-pen-blue-tint px-4 py-3">
            <Clock className="mt-[1px] size-4 shrink-0 text-pen-id" />
            <div className="min-w-0">
              <p className="font-sans text-[12.5px] font-semibold text-pen-id">
                {pendingCount === 1 ? "1 request pending" : `${pendingCount} requests pending`}
              </p>
              <p className="font-sans text-[11.5px] text-pen-id/70">
                This page will redirect automatically once your request is approved.
              </p>
            </div>
          </div>
        )}

        {rejectedCount > 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-pen-red/20 bg-pen-red-tint px-4 py-3">
            <XCircle className="mt-[1px] size-4 shrink-0 text-pen-red" />
            <div className="min-w-0">
              <p className="font-sans text-[12.5px] font-semibold text-pen-red">
                {rejectedCount === 1 ? "1 request was not approved" : `${rejectedCount} requests were not approved`}
              </p>
              <p className="font-sans text-[11.5px] text-pen-red/70">
                You can send a new request to any department below.
              </p>
            </div>
          </div>
        )}

        {/* Department cards */}
        {departments.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-pen-card-border bg-pen-card py-16 text-center">
            <Building2 className="size-8 text-pen-subtle" strokeWidth={1.2} />
            <div>
              <p className="font-sans text-[13px] font-medium text-pen-muted">No departments yet</p>
              <p className="mt-0.5 font-sans text-[11.5px] text-pen-subtle">
                Contact your workspace admin to create one.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {departments.map((dept) => {
              const isPending   = pending.has(dept.id)
              const isRejected  = rejected.has(dept.id)
              const isRequesting = requesting === dept.id

              return (
                <div
                  key={dept.id}
                  className={cn(
                    "group flex items-center gap-4 rounded-2xl border bg-pen-card px-5 py-4 transition-all",
                    isPending  && "border-pen-blue/20 bg-pen-blue-tint/20",
                    isRejected && "border-pen-red/15 bg-pen-red-tint/20",
                    !isPending && !isRejected && "border-pen-card-border hover:border-pen-id/40 hover:shadow-sm",
                  )}
                >
                  {/* Icon */}
                  <div className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl border transition-colors",
                    isPending  && "border-pen-blue/20 bg-pen-blue-tint",
                    isRejected && "border-pen-red/20 bg-pen-red-tint",
                    !isPending && !isRejected && "border-pen-card-border bg-pen-surface group-hover:border-pen-id/20",
                  )}>
                    <Building2
                      className={cn(
                        "size-[18px]",
                        isPending  ? "text-pen-id"  : isRejected ? "text-pen-red/60" : "text-pen-muted",
                      )}
                      strokeWidth={1.5}
                    />
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="font-sans text-[13px] font-semibold text-pen-foreground">
                      {dept.name}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                      <span className="flex items-center gap-1 font-sans text-[11.5px] text-pen-subtle">
                        <Users className="size-3" />
                        {dept.teamCount} {dept.teamCount === 1 ? "team" : "teams"}
                      </span>
                      {dept.managers.length > 0 && (
                        <>
                          <span className="text-pen-subtle/40">·</span>
                          <span className="font-sans text-[11.5px] text-pen-subtle">
                            {dept.managers.join(", ")}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Action */}
                  {isPending ? (
                    <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-pen-blue/20 bg-pen-blue-tint px-3 py-1.5 font-sans text-[11.5px] font-semibold text-pen-id">
                      <Clock className="size-3" />
                      Pending
                    </span>
                  ) : isRejected ? (
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="flex items-center gap-1 font-sans text-[11.5px] font-semibold text-pen-red/80">
                        <XCircle className="size-3" />
                        Not approved
                      </span>
                      <button
                        type="button"
                        onClick={() => requestToJoin(dept.id)}
                        disabled={isRequesting || approved}
                        className="flex items-center gap-1.5 rounded-lg border border-pen-card-border px-3 py-1.5 font-sans text-[11.5px] font-semibold text-pen-foreground transition-colors hover:border-pen-id/40 hover:bg-pen-surface disabled:opacity-60"
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
                      onClick={() => requestToJoin(dept.id)}
                      disabled={isRequesting || approved}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-pen-blue px-4 py-2 font-sans text-[11.5px] font-medium text-white transition-colors hover:bg-pen-blue/90 disabled:opacity-60 dark:text-gray-900"
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
          </div>
        )}

        <p className="text-center font-sans text-[11.5px] text-pen-subtle">
          Need help? Contact your workspace administrator.
        </p>
      </div>
    </div>
  )
}
