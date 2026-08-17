export type TimerKind = "DEVELOPMENT" | "QA"

export type ActiveTaskData = {
  entryId: string
  ticketId: string | null
  ticketDbId: string | null
  title: string
  elapsed: string
  startedAtMs: number
  kind?: TimerKind
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

/** Aggregated stats for one time-entry kind (dev or QA). */
export type TimeKindBucket = {
  weekBars: WeekBar[]
  weekTotalLabel: string
  todayTotal: string
  todayTotalSecs: number
  weekTotalSecs: number
  todaySegments: TodaySegment[]
  todayTasks: TodayTaskSummary[]
  entries: TimeEntryItem[]
}

export type TimeEntriesResponse = {
  weekRangeLabel: string
  activeTask: ActiveTaskData | null
  /** @deprecated Prefer `development` — kept for older clients */
  todayTasks: TodayTaskSummary[]
  weekBars: WeekBar[]
  weekTotalLabel: string
  todayTotal: string
  todaySegments: TodaySegment[]
  entries: TimeEntryItem[]
  development: TimeKindBucket
  qa: TimeKindBucket
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
