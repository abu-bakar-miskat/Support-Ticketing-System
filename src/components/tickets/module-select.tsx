"use client"

import { useEffect, useState } from "react"
import { Boxes } from "lucide-react"
import { updateTicket } from "@/lib/api/tickets"
import { useProjectModules } from "@/hooks/queries/use-modules"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  coloredSelectTriggerClass,
  coloredTriggerStyles,
  sidebarSelectContentClass,
  sidebarSelectItemClass,
} from "@/components/tickets/sidebar-field-styles"

const MODULE_ZERO = "__module0__"
const MODULE_ZERO_LABEL = "Module 0 (General)"
const ACCENT = "#0a76b9"

type Props = {
  ticketId: string
  projectId: string
  moduleId: string | null
  moduleName: string | null
  disabled?: boolean
}

export function ModuleSelect({ ticketId, projectId, moduleId, moduleName, disabled = false }: Props) {
  const [liveModuleId, setLiveModuleId] = useState(moduleId)
  const [liveModuleName, setLiveModuleName] = useState(moduleName)
  const [error, setError] = useState<string | null>(null)

  const { data } = useProjectModules(projectId || null)
  const modules = data?.modules ?? []

  // Sync when the props change from a server/realtime update
  useEffect(() => {
    setLiveModuleId(moduleId)
    setLiveModuleName(moduleName)
  }, [moduleId, moduleName])

  const label = liveModuleId
    ? modules.find((m) => m.id === liveModuleId)?.name ?? liveModuleName ?? "Module"
    : MODULE_ZERO_LABEL

  function onChange(next: string | null) {
    const nextId = next === MODULE_ZERO ? null : next
    if (nextId === liveModuleId) return
    const prevId = liveModuleId
    const prevName = liveModuleName
    // Optimistic update
    setLiveModuleId(nextId)
    setLiveModuleName(nextId ? modules.find((m) => m.id === nextId)?.name ?? null : null)
    setError(null)
    void updateTicket(ticketId, { moduleId: nextId }).catch(() => {
      setLiveModuleId(prevId)
      setLiveModuleName(prevName)
      setError("Failed to update module")
    })
  }

  return (
    <div className="space-y-1">
      <Select
        value={liveModuleId ?? MODULE_ZERO}
        onValueChange={(v) => v && onChange(v as string)}
        disabled={disabled}
      >
        <SelectTrigger
          size="sm"
          className={coloredSelectTriggerClass}
          style={coloredTriggerStyles(ACCENT)}
        >
          <SelectValue>
            <span className="flex min-w-0 items-center gap-2">
              <Boxes className="size-3.5 shrink-0" style={{ color: ACCENT }} />
              <span className="truncate">{label}</span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className={sidebarSelectContentClass}>
          <SelectItem value={MODULE_ZERO} className={sidebarSelectItemClass}>
            {MODULE_ZERO_LABEL}
          </SelectItem>
          {modules.map((m) => (
            <SelectItem key={m.id} value={m.id} className={sidebarSelectItemClass}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? <p className="font-sans text-[11.5px] text-pen-red">{error}</p> : null}
    </div>
  )
}
