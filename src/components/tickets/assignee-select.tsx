"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useDebounce } from "@/hooks/use-debounce"
import { Check, ChevronDown, Search, UserRound } from "lucide-react"
import { cn } from "@/lib/utils"
import { avatarColorFor } from "@/lib/avatar"
import { UserAvatar } from "@/components/ui/user-avatar"
import { UserListItem, userListPickerButtonClass } from "@/components/ui/user-list-item"
import { matchesUserListSearch, type UserListPerson } from "@/lib/user-list-person"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  coloredSelectTriggerClass,
  coloredTriggerStyles,
  neutralSelectTriggerClass,
  neutralTriggerStyles,
  sidebarDropdownPanelClass,
} from "@/components/tickets/sidebar-field-styles"
import { updateTicket } from "@/lib/api/tickets"

export type SubDepartmentMemberOption = UserListPerson

type Props = {
  ticketId: string
  assigneeId: string | null
  assigneeName: string | null
  assigneeAvatarUrl?: string | null
  subDepartmentMembers: SubDepartmentMemberOption[]
  onAssigneeChange?: (member: SubDepartmentMemberOption | null) => void
  disabled?: boolean
}

function MemberAvatar({
  name,
  avatarUrl,
  size,
  userId,
}: {
  name: string
  avatarUrl?: string | null
  size: number
  userId?: string | null
}) {
  return <UserAvatar name={name} avatarUrl={avatarUrl} size={size} userId={userId} />
}

export function AssigneeSelect({
  ticketId,
  assigneeId,
  assigneeName,
  assigneeAvatarUrl,
  subDepartmentMembers,
  onAssigneeChange,
  disabled = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const debouncedQuery = useDebounce(query, 200)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return subDepartmentMembers.filter((m) => matchesUserListSearch(m, debouncedQuery))
  }, [debouncedQuery, subDepartmentMembers])

  useEffect(() => {
    if (open) {
      setQuery("")
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  async function selectMember(nextId: string | null) {
    if (nextId === assigneeId) {
      setOpen(false)
      return
    }
    setError(null)
    const member = nextId ? (subDepartmentMembers.find((m) => m.id === nextId) ?? null) : null
    // Optimistic — other viewers get the same via ticket-activity broadcast
    onAssigneeChange?.(member)
    setOpen(false)
    void updateTicket(ticketId, { assigneeId: nextId }).catch(() => {
      const prev = assigneeId
        ? (subDepartmentMembers.find((m) => m.id === assigneeId) ?? null)
        : null
      onAssigneeChange?.(prev)
      setError("Failed to update assignee")
    })
  }

  const accent = assigneeName ? avatarColorFor(assigneeName) : "#94a3b8"

  return (
    <div className="space-y-1">
      <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
        <PopoverTrigger
          disabled={disabled}
          className={cn(
            assigneeName ? coloredSelectTriggerClass : neutralSelectTriggerClass,
            "flex items-center gap-2 disabled:opacity-60",
          )}
          style={assigneeName ? coloredTriggerStyles(accent) : neutralTriggerStyles}
        >
          {assigneeName ? (
            <MemberAvatar name={assigneeName} avatarUrl={assigneeAvatarUrl} size={22} userId={assigneeId} />
          ) : (
            <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-pen-surface text-pen-subtle">
              <UserRound className="size-3.5" />
            </span>
          )}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-left font-medium",
              assigneeName ? "text-pen-foreground" : "text-pen-muted",
            )}
          >
            {assigneeName ?? "Unassigned"}
          </span>
          <ChevronDown
            className={cn("size-3.5 shrink-0 opacity-60 transition-transform", open && "rotate-180")}
          />
        </PopoverTrigger>

        <PopoverContent
          align="start"
          sideOffset={4}
          className={cn(
            sidebarDropdownPanelClass,
            "w-(--anchor-width) min-w-0 gap-0 overflow-hidden p-0",
          )}
        >
          <div className="border-b border-pen-card-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-pen-subtle" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search members…"
                className="h-8 border-pen-card-border bg-pen-surface pl-8 font-sans text-[12px] "
              />
            </div>
          </div>

          <ul className="max-h-52 overflow-y-auto p-1">
            <li>
              <button
                type="button"
                onClick={() => selectMember(null)}
                className={cn(
                  "pen-field-dropdown-item rounded-md px-2 py-1.5 font-sans text-[12px]",
                  userListPickerButtonClass,
                  !assigneeId && "bg-pen-surface ",
                )}
              >
                <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-pen-surface text-pen-subtle">
                  <UserRound className="size-3.5" />
                </span>
                <span className="flex-1 text-left text-pen-muted">Unassigned</span>
                {!assigneeId ? <Check className="size-3.5 text-pen-blue" /> : null}
              </button>
            </li>

            {filtered.length === 0 ? (
              <li className="px-2 py-3 text-center font-sans text-[11.5px] text-pen-subtle">
                No members match &ldquo;{query}&rdquo;
              </li>
            ) : (
              filtered.map((member) => {
                const selected = member.id === assigneeId
                return (
                  <li key={member.id}>
                    <button
                      type="button"
                      onClick={() => selectMember(member.id)}
                      className={cn(
                        "pen-field-dropdown-item rounded-md px-2 py-1.5 font-sans text-[12px]",
                        userListPickerButtonClass,
                        selected && "bg-pen-surface ",
                      )}
                    >
                      <UserListItem
                        person={member}
                        avatarSize={22}
                        trailing={
                          selected ? <Check className="size-3.5 shrink-0 text-pen-blue" /> : null
                        }
                      />
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </PopoverContent>
      </Popover>

      {error ? <p className="font-sans text-[11.5px] text-pen-red">{error}</p> : null}
    </div>
  )
}
