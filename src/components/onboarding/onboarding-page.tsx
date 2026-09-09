"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Check, Clock, Users, Loader2, LogOut, RotateCcw, XCircle, Search, ArrowRight, ChevronDown } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { BrandIcon } from "@/components/auth/sts-logo"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { UserAvatar } from "@/components/ui/user-avatar"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { toastResponseError } from "@/lib/toast-error"

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
      className="sts-pressable flex items-center gap-1.5 rounded-full px-3 py-1.5 font-sans text-[12px] text-sts-muted transition-colors hover:bg-sts-surface hover:text-sts-foreground"
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

function monogram(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?"
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name
}

export function OnboardingPage({ tenants, pendingKeys, userId, userName }: Props) {
  const [pending,  setPending]  = useState<Set<string>>(new Set(pendingKeys))
  const [rejected, setRejected] = useState<Set<string>>(new Set())
  const [requesting, setRequesting] = useState<string | null>(null)
  const [approved, setApproved] = useState(false)
  const [query, setQuery] = useState("")
  // A single sub-department id selected across the WHOLE page ("" = none). Picking
  // one anywhere clears any previous pick, so only one is ever selected at a time.
  const [selected, setSelected] = useState<string>("")
  // Workspaces start collapsed; the user opens the ones they care about. An empty
  // set means every workspace is closed.
  const [openTenants, setOpenTenants] = useState<Set<string>>(new Set())
  const toggleTenant = useCallback((id: string) => {
    setOpenTenants((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleApproved = useCallback(() => {
    setApproved(true)
    toast.success("You're in! Taking you to your workspace…")
    setTimeout(() => { window.location.href = "/" }, 1500)
  }, [])

  const handleRejected = useCallback((key: string) => {
    setPending((prev)  => { const n = new Set(prev);  n.delete(key); return n })
    setRejected((prev) => new Set(prev).add(key))
    toast.error("That request wasn't approved. You can send a new one anytime.")
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

  async function requestToJoin(subDeptId: string) {
    // New members always join a specific team (sub-department) as an agent.
    if (!subDeptId) return
    const key = subDeptId
    const url = `/api/sub-departments/${subDeptId}/join-requests`

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
        if (res.ok) toast.success("Request sent — a manager will review it shortly.")
      } else {
        await toastResponseError(res, "Couldn't send that request")
      }
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      setRequesting(null)
    }
  }

  const q = query.trim().toLowerCase()
  const filteredTenants = useMemo(() => {
    if (!q) return tenants
    const hit = (s: string) => s.toLowerCase().includes(q)
    return tenants
      .map((t) => ({
        ...t,
        departments: hit(t.name)
          ? t.departments
          : t.departments.filter(
              (d) => hit(d.name) || d.subDepartments.some((s) => hit(s.name)),
            ),
      }))
      .filter((t) => t.departments.length > 0)
  }, [tenants, q])

  const totalDepartments = useMemo(
    () => tenants.reduce((n, t) => n + t.departments.length, 0),
    [tenants],
  )
  const hasAnyDepartments = totalDepartments > 0
  const hasResults = filteredTenants.length > 0
  const pendingCount  = pending.size
  const rejectedCount = rejected.size

  if (approved) {
    return (
      <main className="sts-ambient-bg relative flex min-h-svh items-center justify-center overflow-hidden font-sans">
        <div className="sts-glass-panel sts-modal-enter flex flex-col items-center gap-4 rounded-2xl border px-10 py-12 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-sts-green/10">
            <Check className="size-8 text-sts-green" strokeWidth={2} />
          </div>
          <p className="font-display text-[22px] leading-tight text-sts-foreground">
            You&apos;re in.
          </p>
          <p className="font-sans text-[13px] text-sts-muted">Taking you to your workspace…</p>
          <Loader2 className="size-5 animate-spin text-sts-muted" />
        </div>
      </main>
    )
  }

  return (
    <main className="sts-ambient-bg relative flex min-h-svh flex-col font-sans">
      {/* Top bar */}
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b border-sts-card-border/60 bg-sts-bg/70 px-5 backdrop-blur sm:px-8">
        <BrandIcon className="h-12" />
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-7 px-5 pb-20 pt-10 sm:px-6 lg:px-8">
        {/* Hero */}
        <div className="sts-page-enter flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <UserAvatar name={userName} size={28} />
            <span className="font-sans text-[12px] text-sts-muted">
              Signed in as <span className="font-medium text-sts-foreground">{userName}</span>
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            <span className="sts-text-section-label">Welcome aboard</span>
            <h1 className="font-display text-[34px] leading-[1.05] tracking-[-0.01em] text-sts-foreground text-balance sm:text-[40px]">
              Hey {firstName(userName)} — find your team.
            </h1>
            <p className="max-w-[54ch] font-sans text-[13.5px] leading-relaxed text-sts-muted">
              Find the sub-department you&apos;ll be working on and request to join.
              The moment a manager approves it, you&apos;ll land in your workspace as
              an agent — no refresh needed.
            </p>
          </div>

          {/* Search — only earns its place once the directory is sizeable */}
          {totalDepartments > 4 && (
            <div className="relative mt-1 max-w-[420px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-sts-subtle" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search workspaces, departments or sub-departments"
                aria-label="Search workspaces and departments"
                className="w-full rounded-xl border border-sts-card-border bg-sts-card/60 py-2.5 pl-9 pr-3 font-sans text-[12.5px] text-sts-foreground placeholder:text-sts-subtle transition-colors focus-visible:border-sts-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-accent/35"
              />
            </div>
          )}
        </div>

        {/* Status banners */}
        {(pendingCount > 0 || rejectedCount > 0) && (
          <div className="sts-page-enter flex flex-col gap-2">
            {pendingCount > 0 && (
              <div className="flex items-center gap-2.5 rounded-full border border-sts-blue/25 bg-sts-blue-tint px-3.5 py-2.5">
                <Clock className="size-3.5 shrink-0 text-sts-id" />
                <p className="font-sans text-[12px] text-sts-id">
                  <span className="font-semibold">
                    {pendingCount === 1 ? "1 request pending." : `${pendingCount} requests pending.`}
                  </span>{" "}
                  This page updates the second one is approved.
                </p>
              </div>
            )}
            {rejectedCount > 0 && (
              <div className="flex items-center gap-2.5 rounded-full border border-sts-red/20 bg-sts-red-tint px-3.5 py-2.5">
                <XCircle className="size-3.5 shrink-0 text-sts-red" />
                <p className="font-sans text-[12px] text-sts-red/90">
                  <span className="font-semibold">
                    {rejectedCount === 1 ? "1 request wasn't approved." : `${rejectedCount} requests weren't approved.`}
                  </span>{" "}
                  Send a new one to any team below.
                </p>
              </div>
            )}
          </div>
        )}

        {/* States: no workspaces at all / no search matches / the directory */}
        {!hasAnyDepartments ? (
          <EmptyState
            title="No workspaces yet"
            body="Once an admin sets up a department, it'll show up here for you to join."
          />
        ) : !hasResults ? (
          <EmptyState
            title="Nothing matches that"
            body={`No workspaces or teams match “${query.trim()}”. Try a different search.`}
          />
        ) : (
          <div className="sts-stagger flex flex-col gap-8">
            {filteredTenants.map((tenant) => {
              // While searching, keep matching workspaces open so results are visible.
              const isOpen = q !== "" || openTenants.has(tenant.id)
              return (
                <section key={tenant.id} className="flex flex-col gap-3">
                  {/* Workspace header — a branded card that toggles its departments */}
                  <button
                    type="button"
                    onClick={() => toggleTenant(tenant.id)}
                    aria-expanded={isOpen}
                    className={cn(
                      "sts-pressable group relative flex w-full items-center gap-3.5 overflow-hidden rounded-2xl border p-3 text-left transition-colors",
                      isOpen
                        ? "border-sts-accent/40 bg-sts-accent/5 shadow-sts-card"
                        : "border-sts-card-border bg-sts-card/50 hover:border-sts-accent/30 hover:bg-sts-accent/5",
                    )}
                  >
                    {/* Brand rail — lights up on hover, solid when open */}
                    <span
                      aria-hidden
                      className={cn(
                        "absolute inset-y-0 left-0 w-1 bg-sts-accent transition-opacity",
                        isOpen ? "opacity-100" : "opacity-0 group-hover:opacity-50",
                      )}
                    />
                    {/* Brand monogram */}
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-sts-accent/25 bg-sts-accent/10 font-display text-[17px] leading-none text-sts-accent shadow-sm">
                      {monogram(tenant.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-sans text-[14.5px] font-semibold text-sts-foreground">
                        {tenant.name}
                      </h2>
                      <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-sts-accent/10 px-2 py-[3px] font-sans text-[10.5px] font-medium text-sts-accent">
                        <span className="size-1 rounded-full bg-sts-accent" aria-hidden />
                        {tenant.departments.length} {tenant.departments.length === 1 ? "department" : "departments"}
                      </span>
                    </div>
                    {/* Chevron control */}
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors",
                        isOpen
                          ? "border-sts-accent/30 bg-sts-accent/10 text-sts-accent"
                          : "border-sts-card-border bg-sts-surface/60 text-sts-subtle group-hover:border-sts-accent/25 group-hover:text-sts-accent",
                      )}
                    >
                      <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} />
                    </span>
                  </button>

                  {/* Departments */}
                  {isOpen && (
                    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      {tenant.departments.map((dept) => (
                        <DepartmentCard
                          key={dept.id}
                          dept={dept}
                          selectedSubId={selected}
                          onSelect={(subId) => setSelected((prev) => (prev === subId ? "" : subId))}
                          pending={pending}
                          rejected={rejected}
                          requesting={requesting}
                          onRequest={requestToJoin}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        )}

        <div className="mt-2 flex items-center justify-center gap-1.5">
          <span className="size-1 shrink-0 rounded-full bg-sts-accent" aria-hidden />
          <p className="text-center font-sans text-[11.5px] text-sts-subtle">
            Can&apos;t find your team? Ask your workspace administrator.
          </p>
        </div>
      </div>
    </main>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="sts-glass-panel sts-page-enter flex flex-col items-center gap-2 rounded-2xl border px-6 py-16 text-center">
      <div className="mb-1 flex size-11 items-center justify-center rounded-2xl bg-sts-surface">
        <Search className="size-4 text-sts-subtle" strokeWidth={1.5} />
      </div>
      <p className="font-sans text-[13.5px] font-semibold text-sts-foreground">{title}</p>
      <p className="max-w-[38ch] font-sans text-[12px] leading-relaxed text-sts-subtle">{body}</p>
    </div>
  )
}

function DepartmentCard({
  dept,
  selectedSubId,
  onSelect,
  pending,
  rejected,
  requesting,
  onRequest,
}: {
  dept: Department
  selectedSubId: string
  onSelect: (subId: string) => void
  pending: Set<string>
  rejected: Set<string>
  requesting: string | null
  onRequest: (subId: string) => void
}) {
  // New members join exactly one sub-department as an agent. Selection is global
  // (a single id for the whole page), so at most one of this card's chips is ever
  // active. Pending/rejected status still surfaces here even once the selection
  // has moved to another card, so a request in flight stays visible.
  const hasSubs = dept.subDepartments.length > 0
  const selectedHere = dept.subDepartments.some((s) => s.id === selectedSubId) ? selectedSubId : ""
  const pendingSub  = dept.subDepartments.find((s) => pending.has(s.id))?.id ?? ""
  const rejectedSub = dept.subDepartments.find((s) => rejected.has(s.id))?.id ?? ""
  const isRequesting = requesting !== null && dept.subDepartments.some((s) => s.id === requesting)

  return (
    <div
      className={cn(
        "sts-card-interactive group flex flex-col rounded-2xl border bg-sts-card/50 p-4",
        pendingSub  && "border-sts-blue/30",
        !pendingSub && rejectedSub && "border-sts-red/25",
        !pendingSub && !rejectedSub && "border-sts-card-border",
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-2.5">
        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sts-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-sans text-[13.5px] font-semibold leading-snug text-sts-foreground">
            {dept.name}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-sans text-[11px] text-sts-subtle">
            <span className="flex items-center gap-1">
              <Users className="size-3" />
              {dept.subDepartments.length} {dept.subDepartments.length === 1 ? "sub-department" : "sub-departments"}
            </span>
            {dept.managers.length > 0 && (
              <>
                <span className="text-sts-subtle/40">·</span>
                <span className="truncate">{dept.managers.join(", ")}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Sub-department picker — a new member joins exactly one, as an agent */}
      {hasSubs && (
        <div className="mt-3 flex flex-col gap-1.5">
          <span className="font-sans text-[10.5px] font-medium uppercase tracking-[0.6px] text-sts-subtle">
            Choose a sub-department
          </span>
          <div className="flex flex-wrap gap-1.5">
            {dept.subDepartments.map((sub) => (
              <Chip
                key={sub.id}
                active={selectedSubId === sub.id}
                onClick={() => onSelect(sub.id)}
              >
                {sub.name}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* Action */}
      <div className="mt-3.5 flex-1" />
      {!hasSubs ? (
        <div className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-sts-card-border py-2 font-sans text-[11.5px] text-sts-subtle">
          No sub-departments to join yet
        </div>
      ) : pendingSub ? (
        <div className="flex items-center justify-center gap-1.5 rounded-full border border-sts-blue/25 bg-sts-blue-tint py-2 font-sans text-[12px] font-semibold text-sts-id">
          <Clock className="size-3.5" />
          Pending review
        </div>
      ) : selectedHere ? (
        <button
          type="button"
          onClick={() => onRequest(selectedHere)}
          disabled={isRequesting}
          className={cn(
            "sts-pressable flex items-center justify-center gap-1.5 rounded-full py-2 font-sans text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-accent/60 disabled:opacity-60",
            rejected.has(selectedHere)
              ? "border border-sts-card-border text-sts-foreground hover:border-sts-accent/40 hover:bg-sts-surface"
              : "bg-sts-button text-sts-button-fg hover:bg-sts-button/90",
          )}
        >
          {isRequesting ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Sending…
            </>
          ) : rejected.has(selectedHere) ? (
            <>
              <RotateCcw className="size-3.5" />
              Try again
            </>
          ) : (
            <>
              Request to join
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      ) : rejectedSub ? (
        <div className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-sts-red/30 py-2 font-sans text-[11.5px] text-sts-red/80">
          <XCircle className="size-3.5" />
          Not approved — pick it again to retry
        </div>
      ) : (
        <div className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-sts-card-border py-2 font-sans text-[11.5px] text-sts-subtle">
          Select a sub-department to join
        </div>
      )}
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "sts-pressable rounded-full border px-2.5 py-1 font-sans text-[11.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-accent/40",
        active
          ? "border-sts-accent/50 bg-sts-accent/10 text-sts-foreground"
          : "border-sts-card-border bg-sts-surface/60 text-sts-muted hover:border-sts-accent/30 hover:text-sts-foreground",
      )}
    >
      {children}
    </button>
  )
}
