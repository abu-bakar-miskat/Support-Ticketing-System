"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { invalidateTaskCaches } from "@/hooks/queries/invalidate-task-caches"
import { normalizeStatus, statusDotColor, type SubDepartmentStatusConfig } from "@/components/board/board-types"
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
import { LabelChoiceModal } from "@/components/tickets/label-choice-modal"
import { useLabels } from "@/hooks/queries/use-labels"
import {
  buildLinkedLabelOptions,
  statusHasLinkedLabels,
  chosenLabelForApi,
  hasLinkedLabelSelection,
} from "@/lib/status-label-choice"

function resolveStatus(current: string, statuses: SubDepartmentStatusConfig[]): SubDepartmentStatusConfig | null {
  const exact = statuses.find((s) => s.label === current)
  if (exact) return exact
  const normalized = normalizeStatus(current)
  return statuses.find((s) => s.label === normalized) ?? null
}

type Props = {
  ticketId: string
  currentStatus: string
  statuses: SubDepartmentStatusConfig[]
  onStatusChange?: (newStatus: string) => void
  disabled?: boolean
}

export function StatusSelect({
  ticketId,
  currentStatus,
  statuses,
  onStatusChange,
  disabled = false,
}: Props) {
  const queryClient = useQueryClient()
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null)
  const [pendingStatus, setPendingStatus] = useState<string | null>(null)
  const [pendingChosenLabel, setPendingChosenLabel] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const inflightRef = useRef<AbortController | null>(null)
  const previousStatusRef = useRef(currentStatus)

  const serverResolved = useMemo(
    () => resolveStatus(currentStatus, statuses),
    [currentStatus, statuses],
  )
  const serverValue = serverResolved?.label ?? currentStatus

  const displayValue = optimisticStatus ?? serverValue
  const displayResolved = useMemo(
    () => resolveStatus(displayValue, statuses),
    [displayValue, statuses],
  )
  const accent = displayResolved?.color ?? statusDotColor(displayValue)

  // Clear optimistic overlay once parent/live status catches up
  useEffect(() => {
    if (optimisticStatus && serverValue === optimisticStatus) {
      setOptimisticStatus(null)
    }
  }, [serverValue, optimisticStatus])

  // Keep revert baseline in sync with live/remote status
  useEffect(() => {
    if (!optimisticStatus) {
      previousStatusRef.current = currentStatus
    }
  }, [currentStatus, optimisticStatus])

  function submitMove(status: string, chosenLabel?: string) {
    inflightRef.current?.abort()
    const ctrl = new AbortController()
    inflightRef.current = ctrl

    const previous = previousStatusRef.current
    previousStatusRef.current = status

    // Instant UI — never wait on the network for the spinner
    setOptimisticStatus(status)
    onStatusChange?.(status)

    void (async () => {
      try {
        const res = await fetch(`/api/tickets/${ticketId}/move`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, chosenLabel }),
          signal: ctrl.signal,
        })

        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          previousStatusRef.current = previous
          setOptimisticStatus(null)
          onStatusChange?.(previous)
          toast.error(json.error ?? "Failed to update status", {
            description: "The previous status has been restored.",
          })
          return
        }

        invalidateTaskCaches(queryClient)
        // Hybrid timer auto-start/stop runs in after() — sync once it has settled
        if (
          normalizeStatus(status) === "In Progress" ||
          normalizeStatus(previous) === "In Progress"
        ) {
          const { useTimerStore } = await import("@/store")
          window.setTimeout(() => {
            void useTimerStore.getState().syncFromServer()
          }, 400)
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return
        previousStatusRef.current = previous
        setOptimisticStatus(null)
        onStatusChange?.(previous)
        toast.error("Failed to update status", {
          description: "Check your connection and try again.",
        })
      }
    })()
  }

  const pendingTargetConfig = useMemo(
    () => (pendingStatus ? statuses.find((s) => s.label === pendingStatus) ?? null : null),
    [pendingStatus, statuses],
  )

  const { data: labelOptions, isLoading: labelsLoading } = useLabels()
  const departmentLabels = Array.isArray(labelOptions) ? labelOptions : []
  const pendingLabelOptions = useMemo(
    () => buildLinkedLabelOptions(pendingTargetConfig?.allowedLabels, departmentLabels),
    [pendingTargetConfig, departmentLabels],
  )

  function onChange(next: string | null) {
    if (!next || next === displayValue) return

    const targetConfig = statuses.find((s) => s.label === next)
    if (statusHasLinkedLabels(targetConfig?.allowedLabels)) {
      // Intercept: this status requires picking one of its linked labels
      setPendingStatus(next)
      setPendingChosenLabel(null)
      return
    }

    submitMove(next)
  }

  function confirmLabelChoice() {
    if (!pendingStatus || !hasLinkedLabelSelection(pendingChosenLabel)) return
    const status = pendingStatus
    const label = chosenLabelForApi(pendingChosenLabel)
    setPendingStatus(null)
    setPendingChosenLabel(null)
    setConfirming(false)
    submitMove(status, label)
  }

  function cancelPending() {
    setPendingStatus(null)
    setPendingChosenLabel(null)
  }

  return (
    <div className="flex flex-col gap-2">
      <Select value={displayValue} onValueChange={onChange} disabled={disabled || !!pendingStatus}>
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
              <span className="truncate">{displayValue}</span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className={sidebarSelectContentClass}>
          {statuses.map((s) => (
            <SelectItem key={s.id} value={s.label} className={sidebarSelectItemClass}>
              <span className="flex items-center gap-2">
                <span
                  className={coloredDotClass("md")}
                  style={{ backgroundColor: s.color }}
                />
                {s.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <LabelChoiceModal
        open={!!pendingStatus}
        statusLabel={pendingStatus}
        options={pendingLabelOptions}
        chosen={pendingChosenLabel}
        saving={confirming}
        loading={labelsLoading && pendingLabelOptions.length === 0}
        onChoose={setPendingChosenLabel}
        onCancel={cancelPending}
        onConfirm={() => {
          setConfirming(true)
          confirmLabelChoice()
        }}
      />
    </div>
  )
}
