import { parseOptions } from "@/lib/recruitment"
import type { RecruitmentFieldType } from "@/generated/prisma/enums"

export type StatsField = {
  id: string
  name: string
  type: RecruitmentFieldType
  options: unknown
}

export type StatsCandidate = { values: unknown }

export type StatsBoardInput = {
  id: string
  name: string
  archived: boolean
  createdAt: Date | string
  fields: StatsField[]
  candidates: StatsCandidate[]
}

export type StageCount = { label: string; color: string; count: number }
export type LabelCount = { label: string; count: number }
export type WeekCount = { week: string; count: number }

export type BoardStats = {
  id: string
  name: string
  archived: boolean
  total: number
  hired: number
  rejected: number
  inProgress: number
  noReply: number
  avgRating: number | null
  ratedCount: number
  stages: StageCount[]
  rejectReasons: LabelCount[]
  ratings: [number, number, number, number, number]
  byWeek: WeekCount[]
  firstDate: string | null
  lastDate: string | null
}

export type RecruitmentStats = {
  overall: BoardStats
  boards: BoardStats[]
}

export type StageKind = "hired" | "rejected" | "noReply" | "inProgress"

/** Classify a stage label into an outcome bucket (mirrors chip color logic). */
export function classifyStage(label: string): StageKind {
  const l = label.toLowerCase()
  if (l.includes("hired") || l.includes("passed")) return "hired"
  if (l.includes("reject")) return "rejected"
  if (l.includes("never") || l.includes("no repl")) return "noReply"
  return "inProgress"
}

function values(c: StatsCandidate): Record<string, unknown> {
  return typeof c.values === "object" && c.values !== null && !Array.isArray(c.values)
    ? (c.values as Record<string, unknown>)
    : {}
}

/** ISO Monday of the week containing the date string. */
function weekOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return date
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - ((day + 6) % 7))
  return d.toISOString().slice(0, 10)
}

export function computeBoardStats(board: StatsBoardInput): BoardStats {
  const fields = board.fields
  const stageField =
    fields.find((f) => f.type === "select" && f.name.trim().toLowerCase() === "stage") ??
    fields.find((f) => f.type === "select")
  const rejectField = fields.find(
    (f) => f.type === "select" && f.name.toLowerCase().includes("reject"),
  )
  const ratingField = fields.find((f) => f.type === "rating")
  const dateField = fields.find((f) => f.type === "date")

  const stageOptions = stageField ? parseOptions(stageField.options) : []
  const stageCounts = new Map<string, number>()
  const rejectCounts = new Map<string, number>()
  const ratings: [number, number, number, number, number] = [0, 0, 0, 0, 0]
  const weekCounts = new Map<string, number>()
  let hired = 0
  let rejected = 0
  let noReply = 0
  let inProgress = 0
  let ratingSum = 0
  let ratedCount = 0
  let firstDate: string | null = null
  let lastDate: string | null = null

  for (const c of board.candidates) {
    const v = values(c)

    if (stageField) {
      const raw = v[stageField.id]
      const opt = typeof raw === "string" ? stageOptions.find((o) => o.id === raw) : undefined
      if (opt) {
        stageCounts.set(opt.id, (stageCounts.get(opt.id) ?? 0) + 1)
        const kind = classifyStage(opt.label)
        if (kind === "hired") hired++
        else if (kind === "rejected") rejected++
        else if (kind === "noReply") noReply++
        else inProgress++
      } else {
        inProgress++
      }
    }

    if (rejectField) {
      const raw = v[rejectField.id]
      if (typeof raw === "string") {
        const opt = parseOptions(rejectField.options).find((o) => o.id === raw)
        if (opt) rejectCounts.set(opt.label, (rejectCounts.get(opt.label) ?? 0) + 1)
      }
    }

    if (ratingField) {
      const raw = v[ratingField.id]
      if (typeof raw === "number" && raw >= 1 && raw <= 5) {
        ratings[raw - 1]++
        ratingSum += raw
        ratedCount++
      }
    }

    if (dateField) {
      const raw = v[dateField.id]
      if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
        const day = raw.slice(0, 10)
        if (!firstDate || day < firstDate) firstDate = day
        if (!lastDate || day > lastDate) lastDate = day
        const wk = weekOf(day)
        weekCounts.set(wk, (weekCounts.get(wk) ?? 0) + 1)
      }
    }
  }

  return {
    id: board.id,
    name: board.name,
    archived: board.archived,
    total: board.candidates.length,
    hired,
    rejected,
    inProgress,
    noReply,
    avgRating: ratedCount > 0 ? Math.round((ratingSum / ratedCount) * 10) / 10 : null,
    ratedCount,
    stages: stageOptions
      .map((o) => ({ label: o.label, color: o.color, count: stageCounts.get(o.id) ?? 0 }))
      .filter((s) => s.count > 0)
      .sort((a, b) => b.count - a.count),
    rejectReasons: [...rejectCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    ratings,
    byWeek: [...weekCounts.entries()]
      .map(([week, count]) => ({ week, count }))
      .sort((a, b) => a.week.localeCompare(b.week)),
    firstDate,
    lastDate,
  }
}

function mergeLabelCounts(lists: LabelCount[][]): LabelCount[] {
  const map = new Map<string, number>()
  for (const list of lists) for (const { label, count } of list) map.set(label, (map.get(label) ?? 0) + count)
  return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
}

export function computeRecruitmentStats(boards: StatsBoardInput[]): RecruitmentStats {
  const perBoard = boards.map(computeBoardStats)

  const stageMap = new Map<string, StageCount>()
  for (const b of perBoard) {
    for (const s of b.stages) {
      const existing = stageMap.get(s.label)
      if (existing) existing.count += s.count
      else stageMap.set(s.label, { ...s })
    }
  }
  const weekMap = new Map<string, number>()
  for (const b of perBoard) for (const w of b.byWeek) weekMap.set(w.week, (weekMap.get(w.week) ?? 0) + w.count)

  const ratings = perBoard.reduce<[number, number, number, number, number]>(
    (acc, b) => [
      acc[0] + b.ratings[0],
      acc[1] + b.ratings[1],
      acc[2] + b.ratings[2],
      acc[3] + b.ratings[3],
      acc[4] + b.ratings[4],
    ],
    [0, 0, 0, 0, 0],
  )
  const ratedCount = perBoard.reduce((n, b) => n + b.ratedCount, 0)
  const ratingSum = ratings.reduce((sum, count, i) => sum + count * (i + 1), 0)
  const dates = perBoard.flatMap((b) => [b.firstDate, b.lastDate]).filter((d): d is string => d !== null)

  const overall: BoardStats = {
    id: "overall",
    name: "All recruitments",
    archived: false,
    total: perBoard.reduce((n, b) => n + b.total, 0),
    hired: perBoard.reduce((n, b) => n + b.hired, 0),
    rejected: perBoard.reduce((n, b) => n + b.rejected, 0),
    inProgress: perBoard.reduce((n, b) => n + b.inProgress, 0),
    noReply: perBoard.reduce((n, b) => n + b.noReply, 0),
    avgRating: ratedCount > 0 ? Math.round((ratingSum / ratedCount) * 10) / 10 : null,
    ratedCount,
    stages: [...stageMap.values()].sort((a, b) => b.count - a.count),
    rejectReasons: mergeLabelCounts(perBoard.map((b) => b.rejectReasons)),
    ratings,
    byWeek: [...weekMap.entries()].map(([week, count]) => ({ week, count })).sort((a, b) => a.week.localeCompare(b.week)),
    firstDate: dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null,
    lastDate: dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null,
  }

  return { overall, boards: perBoard }
}
