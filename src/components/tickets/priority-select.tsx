"use client"

import { useEffect, useState } from "react"
import {
  UI_PRIORITIES,
  UI_PRIORITY_DOT_HEX,
  UI_PRIORITY_STYLE,
  UI_TO_DB_PRIORITY,
  type UiPriority,
} from "@/components/board/board-types"
import { updateTicket } from "@/lib/api/tickets"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  coloredDotClass,
  coloredSelectTriggerClass,
  coloredTriggerStyles,
  sidebarSelectContentClass,
  sidebarSelectItemClass,
} from "@/components/tickets/sidebar-field-styles"

type Props = {
  ticketId: string
  priority: UiPriority
  disabled?: boolean
  onPriorityChange?: (priority: UiPriority) => void
}

export function PrioritySelect({ ticketId, priority, disabled = false, onPriorityChange }: Props) {
  const [livePriority, setLivePriority] = useState(priority)
  const [error, setError] = useState<string | null>(null)

  // Sync when the prop changes from a server/realtime update
  useEffect(() => { setLivePriority(priority) }, [priority])

  const accent = UI_PRIORITY_DOT_HEX[livePriority]
  const label = UI_PRIORITY_STYLE[livePriority].label

  function onChange(next: UiPriority | null) {
    if (!next || next === livePriority) return
    const previous = livePriority
    setLivePriority(next)
    onPriorityChange?.(next)
    setError(null)
    void updateTicket(ticketId, { priority: UI_TO_DB_PRIORITY[next] }).catch(() => {
      setLivePriority(previous)
      onPriorityChange?.(previous)
      setError("Failed to update priority")
    })
  }

  return (
    <div className="space-y-1">
      <Select value={livePriority} onValueChange={(v) => v && onChange(v as UiPriority)} disabled={disabled}>
        <SelectTrigger
          size="sm"
          className={coloredSelectTriggerClass}
          style={coloredTriggerStyles(accent)}
        >
          <SelectValue>
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={coloredDotClass()}
                style={{ backgroundColor: accent }}
              />
              <span className="truncate">{label}</span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className={sidebarSelectContentClass}>
          {UI_PRIORITIES.map((p) => {
            const style = UI_PRIORITY_STYLE[p]
            const dot = UI_PRIORITY_DOT_HEX[p]
            return (
              <SelectItem key={p} value={p} className={sidebarSelectItemClass}>
                <span className="flex items-center gap-2">
                  <span
                    className={coloredDotClass("md")}
                    style={{ backgroundColor: dot }}
                  />
                  {style.label}
                </span>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
      {error ? <p className="font-sans text-[11.5px] text-pen-red">{error}</p> : null}
    </div>
  )
}
