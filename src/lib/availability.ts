/**
 * Holiday / unavailability helpers for display badges.
 * Aligns "today" with each member's timezone (same idea as rota.ts).
 */

import { prisma } from "@/lib/db"

export type UserUnavailability = {
  from: string
  to: string
  reason: string | null
  /** Human label, e.g. "Away until 28 Jul" */
  label: string
}

function safeTimezone(tz: string | null | undefined): string {
  if (!tz) return "UTC"
  const candidates = [tz, tz.replace(/\s*\/\s*/g, "/").replace(/ /g, "_")]
  for (const candidate of candidates) {
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: candidate })
      return candidate
    } catch {
      // try next
    }
  }
  return "UTC"
}

function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date())
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(dateKey: string, delta: number): string {
  const d = new Date(dateKey + "T12:00:00.000Z")
  d.setUTCDate(d.getUTCDate() + delta)
  return toDateKey(d)
}

function formatDay(dateKey: string): string {
  const d = new Date(dateKey + "T12:00:00.000Z")
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

function buildLabel(from: string, to: string): string {
  if (from === to) return `Away ${formatDay(from)}`
  const todayUtc = toDateKey(new Date())
  if (from <= todayUtc && to >= todayUtc) {
    return `Away until ${formatDay(to)}`
  }
  return `Away ${formatDay(from)}–${formatDay(to)}`
}

function contiguousRangeContaining(
  dateKeys: string[],
  today: string,
): { from: string; to: string } | null {
  const set = new Set(dateKeys)
  if (!set.has(today)) return null
  let from = today
  let to = today
  while (set.has(addDays(from, -1))) from = addDays(from, -1)
  while (set.has(addDays(to, 1))) to = addDays(to, 1)
  return { from, to }
}

/**
 * Returns users who are on holiday *today* (in their own timezone),
 * with the contiguous holiday block containing today for tooltips.
 */
export async function getUnavailabilityByUserIds(
  userIds?: string[],
): Promise<Record<string, UserUnavailability>> {
  const utcToday = toDateKey(new Date())
  const windowStart = new Date(addDays(utcToday, -45) + "T00:00:00.000Z")
  const windowEnd = new Date(addDays(utcToday, 45) + "T23:59:59.999Z")

  const holidayWhere: {
    date: { gte: Date; lte: Date }
    userId?: { in: string[] }
  } = {
    date: { gte: windowStart, lte: windowEnd },
  }
  if (userIds && userIds.length > 0) {
    holidayWhere.userId = { in: userIds }
  } else if (userIds && userIds.length === 0) {
    return {}
  }

  const holidays = await prisma.memberHoliday.findMany({
    where: holidayWhere,
    select: { userId: true, date: true, reason: true },
    orderBy: { date: "asc" },
  })

  if (holidays.length === 0) return {}

  const byUser = new Map<string, { dates: string[]; reasons: Map<string, string | null> }>()
  for (const h of holidays) {
    const key = toDateKey(h.date)
    let entry = byUser.get(h.userId)
    if (!entry) {
      entry = { dates: [], reasons: new Map() }
      byUser.set(h.userId, entry)
    }
    entry.dates.push(key)
    entry.reasons.set(key, h.reason ?? null)
  }

  const ids = [...byUser.keys()]
  const profiles = await prisma.profile.findMany({
    where: { id: { in: ids } },
    select: { id: true, timezone: true },
  })
  const tzByUser = new Map(profiles.map((p) => [p.id, safeTimezone(p.timezone)]))

  const result: Record<string, UserUnavailability> = {}
  for (const [userId, entry] of byUser) {
    const tz = tzByUser.get(userId) ?? "UTC"
    const today = todayInTz(tz)
    const range = contiguousRangeContaining(entry.dates, today)
    if (!range) continue
    result[userId] = {
      from: range.from,
      to: range.to,
      reason: entry.reasons.get(today) ?? entry.reasons.get(range.from) ?? null,
      label: buildLabel(range.from, range.to),
    }
  }

  return result
}
