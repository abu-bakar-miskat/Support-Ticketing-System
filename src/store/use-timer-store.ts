import { create } from "zustand"

export type TimerKind = "DEVELOPMENT" | "QA"

type TimerMeta = {
  ticketHumanId?: string | null
  ticketTitle?: string | null
  todayTaskCount?: number
  kind?: TimerKind
}

export type RunningTimerSnapshot = {
  entryId: string
  ticketDbId: string | null
  startedAtMs: number
  ticketHumanId: string | null
  ticketTitle: string | null
  todayTaskCount: number
  kind: TimerKind
}

type TimerState = {
  entryId: string | null
  ticketDbId: string | null
  ticketHumanId: string | null
  ticketTitle: string | null
  startedAtMs: number | null
  todayTaskCount: number
  kind: TimerKind | null
  setRunning: (
    entryId: string,
    ticketDbId: string | null,
    startedAtMs: number,
    meta?: TimerMeta,
  ) => void
  setTodayTaskCount: (count: number) => void
  clearRunning: () => void
  syncFromServer: () => Promise<void>
  applyServerSnapshot: (data: RunningTimerSnapshot | null) => void
}

export const useTimerStore = create<TimerState>((set, get) => ({
  entryId: null,
  ticketDbId: null,
  ticketHumanId: null,
  ticketTitle: null,
  startedAtMs: null,
  todayTaskCount: 0,
  kind: null,
  setRunning: (entryId, ticketDbId, startedAtMs, meta) =>
    set({
      entryId,
      ticketDbId,
      startedAtMs,
      ticketHumanId: meta?.ticketHumanId ?? null,
      ticketTitle: meta?.ticketTitle ?? null,
      kind: meta?.kind ?? "DEVELOPMENT",
      ...(meta?.todayTaskCount != null ? { todayTaskCount: meta.todayTaskCount } : {}),
    }),
  setTodayTaskCount: (count) => set({ todayTaskCount: count }),
  clearRunning: () =>
    set({
      entryId: null,
      ticketDbId: null,
      ticketHumanId: null,
      ticketTitle: null,
      startedAtMs: null,
      todayTaskCount: 0,
      kind: null,
    }),
  applyServerSnapshot: (data) => {
    if (data?.entryId) {
      set({
        entryId: data.entryId,
        ticketDbId: data.ticketDbId,
        startedAtMs: data.startedAtMs,
        ticketHumanId: data.ticketHumanId,
        ticketTitle: data.ticketTitle,
        todayTaskCount: data.todayTaskCount,
        kind: data.kind ?? "DEVELOPMENT",
      })
    } else {
      get().clearRunning()
    }
  },
  syncFromServer: async () => {
    try {
      const data = await fetch("/api/time").then((r) => r.json()) as {
        entryId: string
        ticketDbId: string | null
        startedAtMs: number
        ticketHumanId?: string | null
        ticketTitle?: string | null
        todayTaskCount?: number
        kind?: TimerKind
      } | null

      if (data?.entryId) {
        get().applyServerSnapshot({
          entryId: data.entryId,
          ticketDbId: data.ticketDbId,
          startedAtMs: data.startedAtMs,
          ticketHumanId: data.ticketHumanId ?? null,
          ticketTitle: data.ticketTitle ?? null,
          todayTaskCount: data.todayTaskCount ?? 0,
          kind: data.kind === "QA" ? "QA" : "DEVELOPMENT",
        })
      } else {
        get().clearRunning()
      }
    } catch {
      // ignore — keep last known client state
    }
  },
}))
