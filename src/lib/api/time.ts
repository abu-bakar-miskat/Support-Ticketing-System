export type ActiveTaskData = {
  entryId: string
  ticketId: string | null
  ticketDbId: string | null
  title: string
  elapsed: string
  startedAtMs: number
}

export type TodayTaskSummary = {
  entryId: string
  ticketDbId: string | null
  ticketId: string | null
  title: string
  project: string
  projectColor: string
  totalSecs: number
  running: boolean
  startedAtMs: number | null
}

export type TimeEntryItem = {
  id: string
  title: string
  ticketId?: string
  ticketDbId?: string
  project: string
  projectColor: string
  timeRange?: string
  running?: boolean
  duration: string
  totalSecs: number
  sessionCount: number
}

export type WeekBar = {
  day: string
  height: number
  today: boolean
  empty: boolean
}

export type TodaySegment = {
  name: string
  pct: number
}

export type TimeEntriesResponse = {
  weekRangeLabel: string
  activeTask: ActiveTaskData | null
  todayTasks: TodayTaskSummary[]
  weekBars: WeekBar[]
  weekTotalLabel: string
  todayTotal: string
  todayTotalSecs: number
  weekTotalSecs: number
  todaySegments: TodaySegment[]
  entries: TimeEntryItem[]
}

export async function fetchTimeEntries(): Promise<TimeEntriesResponse> {
  const res = await fetch("/api/time/entries")
  if (!res.ok) throw new Error("Failed to fetch time entries")
  return res.json()
}

export async function startTimer(ticketId?: string): Promise<void> {
  const res = await fetch("/api/time", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "start", ticketId }),
  })
  if (!res.ok) throw new Error("Failed to start timer")
}

export async function stopTimer(entryId?: string): Promise<void> {
  const res = await fetch("/api/time", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "stop", entryId }),
  })
  if (!res.ok) throw new Error("Failed to stop timer")
}
