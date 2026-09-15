"use client"

import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useTimerStore } from "@/store"
import { ticketKeys, taskKeys, timeKeys } from "@/hooks/queries/keys"

type StartTimerOpts = {
  ticketDbId: string
  humanId: string
  title: string
}

export function useTimerActions() {
  const queryClient = useQueryClient()
  const setRunning = useTimerStore((s) => s.setRunning)
  const clearRunning = useTimerStore((s) => s.clearRunning)
  const syncFromServer = useTimerStore((s) => s.syncFromServer)

  const invalidateTimerQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: timeKeys.entries() }),
      queryClient.invalidateQueries({ queryKey: taskKeys.my() }),
      queryClient.invalidateQueries({ queryKey: ticketKeys.all }),
    ])
  }, [queryClient])

  const startTimer = useCallback(
    async ({ ticketDbId, humanId, title }: StartTimerOpts) => {
      // Show the running state as soon as the user clicks. The real entry id
      // replaces this temporary one once the server confirms the time entry.
      const optimisticEntryId = `pending-${Date.now()}`
      const startedAtMs = Date.now()
      setRunning(optimisticEntryId, ticketDbId, startedAtMs, {
        ticketHumanId: humanId,
        ticketTitle: title,
      })
      try {
        const res = await fetch("/api/time", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start", ticketId: ticketDbId }),
        })
        if (!res.ok) throw new Error("Failed to start timer")

        const entry = (await res.json()) as { id: string; startedAt: string }
        setRunning(entry.id, ticketDbId, new Date(entry.startedAt).getTime(), {
          ticketHumanId: humanId,
          ticketTitle: title,
        })
        await invalidateTimerQueries()
        return entry
      } catch (error) {
        // A network failure can happen after the server created the entry, so
        // reconcile rather than assuming it did not start.
        await syncFromServer()
        throw error
      }
    },
    [setRunning, syncFromServer, invalidateTimerQueries],
  )

  const stopTimer = useCallback(
    async (entryId?: string | null) => {
      const previous = useTimerStore.getState()
      clearRunning()
      try {
        const res = await fetch("/api/time", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "stop", entryId: entryId ?? undefined }),
        })

        if (!res.ok && res.status !== 404) {
          throw new Error("Failed to stop timer")
        }
        await syncFromServer()
        await invalidateTimerQueries()
        return
      } catch (error) {
        // Restore the visible timer only when another action has not already
        // started a different one, then let the next sync confirm it.
        if (!useTimerStore.getState().entryId && previous.entryId) {
          setRunning(previous.entryId, previous.ticketDbId, previous.startedAtMs ?? Date.now(), {
            ticketHumanId: previous.ticketHumanId,
            ticketTitle: previous.ticketTitle,
            todayTaskCount: previous.todayTaskCount,
          })
        }
        throw error
      }
    },
    [clearRunning, setRunning, syncFromServer, invalidateTimerQueries],
  )

  return { startTimer, stopTimer, invalidateTimerQueries, clearRunning }
}
