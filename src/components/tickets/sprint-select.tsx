"use client"

import { useEffect, useState } from "react"
import { Zap } from "lucide-react"
import { updateTicket } from "@/lib/api/tickets"
import { useSprints } from "@/hooks/queries/use-sprints"
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

const NO_SPRINT = "__no_sprint__"
const NO_SPRINT_LABEL = "No sprint"
const ACCENT = "#7c3aed"

type Props = {
  ticketId: string
  projectId: string
  sprintId: string | null
  sprintName: string | null
  disabled?: boolean
}

export function SprintSelect({ ticketId, projectId, sprintId, sprintName, disabled = false }: Props) {
  const [liveId, setLiveId] = useState(sprintId)
  const [liveName, setLiveName] = useState(sprintName)
  const [error, setError] = useState<string | null>(null)

  const { data: sprints = [] } = useSprints()
  // Match create-ticket: only this project's sprints. Keep the field if the
  // ticket already has a sprint so it can be cleared or reassigned.
  const projectSprints = sprints.filter((s) => s.projectId === projectId)
  const options =
    liveId && !projectSprints.some((s) => s.id === liveId)
      ? [{ id: liveId, name: liveName ?? "Sprint", projectId }, ...projectSprints]
      : projectSprints

  // Sync when props change from a server/realtime update
  useEffect(() => {
    setLiveId(sprintId)
    setLiveName(sprintName)
  }, [sprintId, sprintName])

  // Nothing to assign and nothing assigned — hide the field entirely.
  if (projectSprints.length === 0 && !liveId) return null

  const label = liveId
    ? options.find((s) => s.id === liveId)?.name ?? liveName ?? "Sprint"
    : NO_SPRINT_LABEL

  function onChange(next: string | null) {
    const nextId = next === NO_SPRINT ? null : next
    if (nextId === liveId) return
    const prevId = liveId
    const prevName = liveName
    setLiveId(nextId)
    setLiveName(nextId ? options.find((s) => s.id === nextId)?.name ?? null : null)
    setError(null)
    void updateTicket(ticketId, { sprintId: nextId }).catch(() => {
      setLiveId(prevId)
      setLiveName(prevName)
      setError("Failed to update sprint")
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="pen-text-label">Sprint</p>
      <div className="space-y-1">
        <Select
          value={liveId ?? NO_SPRINT}
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
                <Zap className="size-3.5 shrink-0" style={{ color: ACCENT }} />
                <span className="truncate">{label}</span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent className={sidebarSelectContentClass}>
            <SelectItem value={NO_SPRINT} className={sidebarSelectItemClass}>
              {NO_SPRINT_LABEL}
            </SelectItem>
            {options.map((s) => (
              <SelectItem key={s.id} value={s.id} className={sidebarSelectItemClass}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error ? <p className="font-sans text-[11.5px] text-pen-red">{error}</p> : null}
      </div>
    </div>
  )
}
