import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import {
  entrySeconds,
  formatClock,
  formatDateRange,
  formatHm,
  formatHms,
  formatTimeOfDay,
  getWeekBounds,
} from "@/lib/time-data"
import type {
  TimeEntriesResponse,
  TimeKindBucket,
  TodaySegment,
  TodayTaskSummary,
  TimeEntryItem,
  WeekBar,
  ActiveTaskData,
} from "@/lib/api/time"

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"] as const
const FALLBACK_PROJECT_COLOR = "#f59e0b"

type RawEntry = {
  id: string
  startedAt: Date
  endedAt: Date | null
  durationSecs: number | null
  ticketId: string | null
  note: string | null
  kind: "DEVELOPMENT" | "QA"
  ticket: {
    title: string
    ticketNumber: number
    subDepartment: { prefix: string }
    project: { name: string; color: string | null } | null
  } | null
}

function buildKindBucket(
  rawEntries: RawEntry[],
  now: Date,
  weekStart: Date,
  weekEnd: Date,
  startOfToday: Date,
  todayIndex: number,
): TimeKindBucket {
  const daySecs = [0, 0, 0, 0, 0, 0, 0]
  for (const entry of rawEntries) {
    if (entry.startedAt < weekStart || entry.startedAt >= weekEnd) continue
    const idx = (entry.startedAt.getDay() + 6) % 7
    daySecs[idx] += entrySeconds(entry, now)
  }
  const maxDaySecs = Math.max(...daySecs)
  const weekBars: WeekBar[] = daySecs.map((secs, i) => ({
    day: DAY_LETTERS[i],
    height: secs === 0 || maxDaySecs === 0 ? 3 : Math.max(6, Math.round((secs / maxDaySecs) * 64)),
    today: i === todayIndex,
    empty: secs === 0,
  }))

  const weekSecs = daySecs.reduce((sum, s) => sum + s, 0)

  const todayEntries = rawEntries.filter(
    (e) => e.endedAt === null || e.startedAt >= startOfToday,
  )
  const todaySecs = todayEntries.reduce((sum, e) => sum + entrySeconds(e, now), 0)
  const projectSecs = new Map<string, number>()
  for (const entry of todayEntries) {
    const name = entry.ticket?.project?.name ?? "Internal"
    projectSecs.set(name, (projectSecs.get(name) ?? 0) + entrySeconds(entry, now))
  }
  const todaySegments: TodaySegment[] = [...projectSecs.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, secs]) => ({
      name,
      pct: todaySecs > 0 ? Math.round((secs / todaySecs) * 1000) / 10 : 0,
    }))

  const taskGroups = new Map<string, RawEntry[]>()
  for (const entry of todayEntries) {
    const key = entry.ticketId ?? entry.note ?? entry.id
    const group = taskGroups.get(key)
    if (group) group.push(entry)
    else taskGroups.set(key, [entry])
  }

  const groupedToday = [...taskGroups.entries()].map(([, group]) => {
    const runningEntry = group.find((e) => e.endedAt === null) ?? null
    const latest = group.reduce((a, b) =>
      a.startedAt.getTime() >= b.startedAt.getTime() ? a : b,
    )
    const totalSecs = group.reduce((sum, e) => sum + entrySeconds(e, now), 0)
    const humanId = latest.ticket
      ? `${latest.ticket.subDepartment.prefix}-${latest.ticket.ticketNumber}`
      : null
    const sessionCount = group.length
    const earliest = group.reduce((a, b) =>
      a.startedAt.getTime() <= b.startedAt.getTime() ? a : b,
    )
    const latestEnded = group
      .filter((e) => e.endedAt)
      .reduce<RawEntry | null>(
        (acc, e) => (!acc || e.endedAt!.getTime() > acc.endedAt!.getTime() ? e : acc),
        null,
      )
    const running = runningEntry !== null
    const timeRange = running
      ? undefined
      : sessionCount > 1
        ? `${sessionCount} sessions`
        : latestEnded
          ? `${formatTimeOfDay(earliest.startedAt)} – ${formatTimeOfDay(latestEnded.endedAt!)}`
          : undefined

    const task: TodayTaskSummary = {
      entryId: runningEntry?.id ?? latest.id,
      ticketDbId: latest.ticketId ?? null,
      ticketId: humanId,
      title: latest.ticket?.title ?? latest.note ?? "Time entry",
      project: latest.ticket?.project?.name ?? "Internal",
      projectColor: latest.ticket?.project?.color ?? FALLBACK_PROJECT_COLOR,
      totalSecs,
      running,
      startedAtMs: runningEntry?.startedAt.getTime() ?? null,
    }
    const entry: TimeEntryItem = {
      id: runningEntry?.id ?? latest.id,
      title: latest.ticket?.title ?? latest.note ?? "Time entry",
      ticketId: humanId ?? undefined,
      ticketDbId: latest.ticketId ?? undefined,
      project: latest.ticket?.project?.name ?? "Internal",
      projectColor: latest.ticket?.project?.color ?? FALLBACK_PROJECT_COLOR,
      timeRange,
      running,
      duration: formatHms(totalSecs),
      totalSecs,
      sessionCount,
    }
    return { task, entry }
  })

  groupedToday.sort((a, b) => {
    if (a.task.running !== b.task.running) return a.task.running ? -1 : 1
    return b.task.totalSecs - a.task.totalSecs
  })

  return {
    weekBars,
    weekTotalLabel: `${formatHm(weekSecs)} / 40h`,
    todayTotal: formatHm(todaySecs),
    todayTotalSecs: todaySecs,
    weekTotalSecs: weekSecs,
    todaySegments,
    todayTasks: groupedToday.map((g) => g.task),
    entries: groupedToday.map((g) => g.entry),
  }
}

export async function GET() {
  const { profile, error } = await requireAuth()
  if (error) return error

  const now = new Date()
  const { weekStart, weekEnd } = getWeekBounds(now)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayIndex = (now.getDay() + 6) % 7

  const rawEntries = (await prisma.timeEntry.findMany({
    where: {
      profileId: profile.id,
      OR: [{ startedAt: { gte: weekStart, lt: weekEnd } }, { endedAt: null }],
    },
    select: {
      id: true,
      startedAt: true,
      endedAt: true,
      durationSecs: true,
      ticketId: true,
      note: true,
      kind: true,
      ticket: {
        select: {
          title: true,
          ticketNumber: true,
          subDepartment: { select: { prefix: true } },
          project: { select: { name: true, color: true } },
        },
      },
    },
    orderBy: { startedAt: "desc" },
  })) as RawEntry[]

  const developmentEntries = rawEntries.filter((e) => e.kind !== "QA")
  const qaEntries = rawEntries.filter((e) => e.kind === "QA")

  const development = buildKindBucket(
    developmentEntries,
    now,
    weekStart,
    weekEnd,
    startOfToday,
    todayIndex,
  )
  const qa = buildKindBucket(
    qaEntries,
    now,
    weekStart,
    weekEnd,
    startOfToday,
    todayIndex,
  )

  // Prefer the live running entry of either kind for the top-level activeTask
  const running = rawEntries.find((e) => e.endedAt === null) ?? null
  const activeTask: ActiveTaskData | null = running
    ? {
        entryId: running.id,
        ticketId: running.ticket
          ? `${running.ticket.subDepartment.prefix}-${running.ticket.ticketNumber}`
          : null,
        ticketDbId: running.ticketId ?? null,
        title: running.ticket?.title ?? running.note ?? "Untitled timer",
        elapsed: formatClock(entrySeconds(running, now)),
        startedAtMs: running.startedAt.getTime(),
        kind: running.kind === "QA" ? "QA" : "DEVELOPMENT",
      }
    : null

  const response: TimeEntriesResponse = {
    weekRangeLabel: formatDateRange(weekStart, new Date(weekEnd.getTime() - 86_400_000)),
    activeTask,
    // Top-level fields remain DEVELOPMENT for backward compatibility
    todayTasks: development.todayTasks,
    weekBars: development.weekBars,
    weekTotalLabel: development.weekTotalLabel,
    todayTotal: development.todayTotal,
    todaySegments: development.todaySegments,
    entries: development.entries,
    development,
    qa,
  }

  return NextResponse.json(response)
}
