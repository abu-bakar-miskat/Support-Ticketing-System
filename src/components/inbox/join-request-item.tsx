"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Users, Check, X, ChevronLeft, Clock } from "lucide-react"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Button } from "@/components/ui/button"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { cn } from "@/lib/utils"
import type { Role } from "@/generated/prisma/enums"
import { handleJoinRequest } from "@/lib/api/sub-departments"

export type JoinRequestNotification = {
  id: string
  actor: string
  actorInitials: string
  actorColor: string
  actorAvatarUrl?: string | null
  time: string
  createdAt: string
  unread: boolean
  section: "today" | "earlier"
  subDepartmentName: string
  subDepartmentId: string
  departmentId?: string | null
  requestId: string | null
  requestStatus: "pending" | "approved" | "rejected" | null
  message: string | null
}

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "agent", label: "Agent" },
  { value: "sub_manager", label: "Sub-manager" },
  { value: "manager", label: "Manager" },
]

export function JoinRequestRow({
  item,
  selected,
  onSelect,
}: {
  item: JoinRequestNotification
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex h-[72px] w-full items-center gap-2.5 border-b border-[#f0f4f8] px-3.5 text-left transition-colors dark:border-[#3a3a37]",
        selected && "bg-sts-blue-tint",
        !selected && item.unread && "bg-sts-bg/50 dark:bg-[rgba(38,38,36,0.5)]",
      )}
    >
      {/* Unread indicator */}
      <span className="relative h-[72px] w-2 shrink-0">
        {item.unread && (
          <span className="absolute inset-y-0 left-0 w-[3px] bg-sts-blue" />
        )}
      </span>

      <span className="flex size-[17px] shrink-0 items-center justify-center">
        <Users className="size-[15px] text-sts-green" strokeWidth={2} />
      </span>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <div className="flex min-w-0 items-center gap-1">
          <UserAvatar name={item.actor} size={15} avatarUrl={item.actorAvatarUrl ?? null} />
          <span className="shrink-0 font-sans text-xs font-semibold text-sts-foreground">
            {item.actor}
          </span>
          <span className="truncate font-sans text-[11.5px] font-normal text-sts-muted">
            wants to join {item.subDepartmentName}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[11.5px]">
          {item.requestStatus === "approved" && (
            <span className="font-sans font-semibold text-sts-green">Approved</span>
          )}
          {item.requestStatus === "rejected" && (
            <span className="font-sans font-semibold text-sts-red">Rejected</span>
          )}
          {item.requestStatus === "pending" && (
            <span className="flex items-center gap-1 font-sans font-medium text-sts-subtle">
              <Clock className="size-2.5" />
              Pending · review in Settings
            </span>
          )}
          <span className="font-sans font-normal text-sts-subtle">· {item.time}</span>
        </div>
      </div>
    </button>
  )
}

export function JoinRequestDetailPane({
  notification,
  onMarkDone,
  onBack,
  showBack,
}: {
  notification: JoinRequestNotification
  onMarkDone: (id: string) => void
  onBack?: () => void
  showBack?: boolean
}) {
  const router = useRouter()
  const [accessType, setAccessType] = useState<"full" | "cross-access">("full")
  const [selectedRole, setSelectedRole] = useState<Role>("agent")
  const [nickname, setNickname] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [submitting, setSubmitting] = useState<"approve" | "reject" | null>(null)
  const [localStatus, setLocalStatus] = useState(notification.requestStatus)

  const isPending = localStatus === "pending"

  async function handleAction(action: "approve" | "reject") {
    if (!notification.requestId) return
    setSubmitting(action)
    try {
      try {
        await handleJoinRequest(notification.subDepartmentId, notification.requestId, {
          action,
          ...(action === "approve" && accessType === "cross-access"
            ? { crossAccess: true }
            : { role: selectedRole, nickname: nickname.trim() || null, isActive }
          ),
        })
        setLocalStatus(action === "approve" ? "approved" : "rejected")
        onMarkDone(notification.id)
        router.refresh()
      } catch {
        // silently ignore — submitting will reset in finally
      }
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-sts-bg">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-sts-card-border bg-sts-card pl-6 pr-[18px]">
        {showBack && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="mr-0 shrink-0 lg:hidden"
            onClick={onBack}
            aria-label="Back to inbox"
          >
            <ChevronLeft className="size-4" />
          </Button>
        )}
        <Users className="size-4 shrink-0 text-sts-green" strokeWidth={2} />
        <p className="shrink-0 font-sans text-[13px] font-semibold text-sts-foreground">
          Join Request
        </p>
        <span className="shrink-0 font-sans text-[11.5px] font-normal text-sts-muted">
          · {notification.time}
        </span>
        <span className="flex-1" />
        {notification.unread && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onMarkDone(notification.id)}
            className="h-[30px] w-24 gap-1.5 rounded-md border-sts-card-border bg-transparent px-0 font-sans text-[11.5px] font-semibold text-sts-foreground hover:bg-sts-bg"
          >
            <Check className="size-3" />
            Mark done
          </Button>
        )}
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-7 py-6">
        {/* Request card */}
        <div className="rounded-[10px] border border-sts-card-border bg-sts-card px-[18px] py-3.5">
          <div className="flex items-center gap-3">
            <UserAvatar name={notification.actor} size={36} avatarUrl={notification.actorAvatarUrl ?? null} />
            <div className="min-w-0 flex-1">
              <p className="sts-text-card-title">
                {notification.actor}
              </p>
              <p className="font-sans text-[11.5px] text-sts-subtle">
                wants to join <span className="font-semibold text-sts-foreground">{notification.subDepartmentName}</span>
              </p>
            </div>
            {localStatus === "approved" && (
              <span className="rounded-full bg-sts-green/10 px-3 py-1 font-sans text-[11.5px] font-semibold text-sts-green">
                Approved
              </span>
            )}
            {localStatus === "rejected" && (
              <span className="rounded-full bg-sts-red-tint px-3 py-1 font-sans text-[11.5px] font-semibold text-sts-red">
                Rejected
              </span>
            )}
            {localStatus === "pending" && (
              <span className="flex items-center gap-1 rounded-full bg-sts-blue-tint px-3 py-1 font-sans text-[11.5px] font-semibold text-sts-id">
                <Clock className="size-3" />
                Pending
              </span>
            )}
          </div>

          {notification.message && (
            <p className="mt-3 font-sans text-[12.5px] text-sts-foreground italic">
              "{notification.message}"
            </p>
          )}
        </div>

        {/* Approval form — only show if pending */}
        {isPending && notification.requestId && (
          <div className="rounded-[10px] border border-sts-card-border bg-sts-card px-[18px] py-4">
            <p className="mb-3 font-sans text-[11.5px] font-medium tracking-[0.8px] text-sts-subtle">
              APPROVAL OPTIONS
            </p>

            {/* Access type toggle */}
            <div className="mb-3">
              <label className="mb-1.5 block font-sans text-[11.5px] text-sts-subtle">
                Access type
              </label>
              <div className="flex gap-2">
                {(["full", "cross-access"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setAccessType(type)}
                    className={cn(
                      "flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-all",
                      accessType === type
                        ? "border-sts-id bg-sts-blue-tint"
                        : "border-sts-card-border bg-sts-bg hover:border-sts-id/40",
                    )}
                  >
                    <span className={cn(
                      "font-sans text-[12px] font-semibold",
                      accessType === type ? "text-sts-id" : "text-sts-foreground",
                    )}>
                      {type === "full" ? "Full member" : "Cross-dept access"}
                    </span>
                    <span className="font-sans text-[11px] text-sts-subtle">
                      {type === "full" ? "Joins as team member" : "Guest access, no team"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Full member options */}
            {accessType === "full" && (<>
            {/* Role selector */}
            <div className="mb-3">
              <label className="mb-1 block font-sans text-[11.5px] text-sts-subtle">
                Role
              </label>
              <SearchableSelect
                value={selectedRole}
                onChange={(v) => setSelectedRole(v as Role)}
                options={ROLE_OPTIONS}
                searchable={false}
                size="sm"
                className="bg-sts-bg"
                aria-label="Role"
              />
            </div>

            {/* Nickname */}
            <div className="mb-3">
              <label className="mb-1 block font-sans text-[11.5px] text-sts-subtle">
                Nickname (optional)
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Display name in this team"
                className="w-full rounded-md border border-sts-card-border bg-sts-bg px-2.5 py-1.5 font-sans text-[12.5px] text-sts-foreground placeholder:text-sts-muted outline-none focus:border-sts-id"
              />
            </div>

            {/* Active toggle */}
            <div className="mb-4 flex items-center gap-2.5">
              <button
                type="button"
                role="switch"
                aria-checked={isActive}
                onClick={() => setIsActive((v) => !v)}
                className={cn(
                  "relative h-5 w-9 rounded-full transition-colors",
                  isActive ? "bg-sts-id" : "bg-sts-card-border",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform",
                    isActive ? "translate-x-4" : "translate-x-0.5",
                  )}
                />
              </button>
              <span className="font-sans text-[12px] text-sts-foreground">
                Active membership
              </span>
            </div>
            </>)}

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleAction("approve")}
                disabled={submitting !== null}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-sts-green px-4 py-2 font-sans text-[12.5px] font-medium text-white disabled:opacity-60"
              >
                {submitting === "approve" ? (
                  <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Approve
              </button>
              <button
                type="button"
                onClick={() => void handleAction("reject")}
                disabled={submitting !== null}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-sts-card-border bg-transparent px-4 py-2 font-sans text-[12.5px] font-semibold text-sts-foreground hover:bg-sts-bg disabled:opacity-60"
              >
                {submitting === "reject" ? (
                  <span className="size-3.5 animate-spin rounded-full border-2 border-sts-foreground border-t-transparent" />
                ) : (
                  <X className="size-3.5" />
                )}
                Reject
              </button>
            </div>
          </div>
        )}

        <span className="flex-1" />
      </div>
    </div>
  )
}
