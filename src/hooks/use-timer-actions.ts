"use client"

import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useTimerStore, type TimerKind } from "@/store"
import { ticketKeys, taskKeys, timeKeys } from "@/hooks/queries/keys"

type StartTimerOpts = {
  ticketDbId: string
  humanId: string
  title: string
  kind?: TimerKind
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
    async ({ ticketDbId, humanId, title, kind = "DEVELOPMENT" }: StartTimerOpts) => {
      const res = await fetch("/api/time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", ticketId: ticketDbId, kind }),
      })
      if (!res.ok) throw new Error("Failed to start timer")

      const entry = (await res.json()) as { id: string; startedAt: string; kind?: TimerKind }
      setRunning(entry.id, ticketDbId, new Date(entry.startedAt).getTime(), {
        ticketHumanId: humanId,
        ticketTitle: title,
        kind: entry.kind === "QA" ? "QA" : kind,
      })
      await invalidateTimerQueries()
      return entry
    },
    [setRunning, invalidateTimerQueries],
  )

  const stopTimer = useCallback(
    async (entryId?: string | null) => {
      const res = await fetch("/api/time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", entryId: entryId ?? undefined }),
      })

      if (res.ok || res.status === 404) {
        await syncFromServer()
        await invalidateTimerQueries()
        return
      }

      throw new Error("Failed to stop timer")
    },
    [syncFromServer, invalidateTimerQueries],
  )

  return { startTimer, stopTimer, invalidateTimerQueries, clearRunning }
}
