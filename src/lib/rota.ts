/**
 * Shared ROTA (round-robin) assignment utility.
 *
 * Extracted from intake-conversion.ts so the same logic can be reused
 * without coupling it to intake-specific concerns.
 *
 * Schedule-awareness: inactive members (isActive=false), those on a holiday today, or
 * outside their working hours are skipped. If nobody is inside working hours the
 * pool is empty (ASG-04 / WH-03) — callers must leave the ticket unassigned and
 * record ASSIGNMENT_FAILED rather than assigning an off-hours agent.
 */

import { prisma } from "@/lib/db"

// ─── Timezone helpers (no extra deps — uses native Intl API) ──────────────────

function getNowInTz(tz: string): { dayOfWeek: number; time: string } {
  const now = new Date()
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now)

  const dayStr = parts.find((p) => p.type === "weekday")?.value ?? "Mon"
  // Intl can emit "24" at midnight with hour12:false — normalize to "00"
  // so string comparisons against workStartTime/workEndTime stay correct.
  let hour = parts.find((p) => p.type === "hour")?.value ?? "09"
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00"
  if (hour === "24") hour = "00"

  const DAY_MAP: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  }
  return {
    dayOfWeek: DAY_MAP[dayStr] ?? 1,
    time: `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`,
  }
}

function getTodayStringInTz(tz: string): string {
  // Returns "YYYY-MM-DD" in the given timezone
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date())
}

/**
 * Profiles have historically stored display-style timezone labels
 * ("Europe / London") that are not valid IANA IDs. An invalid ID makes
 * Intl.DateTimeFormat throw, which used to 500 the public intake submit.
 * Normalize what we can, fall back to UTC for anything else.
 */
function safeTimezone(tz: string | null | undefined): string {
  if (!tz) return "UTC"
  const candidates = [tz, tz.replace(/\s*\/\s*/g, "/").replace(/ /g, "_")]
  for (const candidate of candidates) {
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: candidate })
      return candidate
    } catch {
      // try next candidate
    }
  }
  return "UTC"
}

// ─── Per-member availability check ───────────────────────────────────────────

/**
 * "Active in rotation" check only — profile-level isActive or team-membership doNotAssign.
 * Unlike isMemberAvailableNow, this ignores working hours/holidays, so it's safe to
 * use for manual bulk actions (e.g. admin round-robin over an explicitly chosen set
 * of members) where filtering out anyone merely outside working hours right now
 * would collapse the candidate pool and break the round-robin distribution.
 */
export async function isMemberActiveInRotation(userId: string, subDepartmentId: string): Promise<boolean> {
  const [profile, membership] = await Promise.all([
    prisma.profile.findUnique({
      where: { id: userId },
      select: { isActive: true },
    }),
    (prisma.subDepartmentMembership as any).findUnique({
      where: { userId_subDepartmentId: { userId, subDepartmentId } },
      select: { doNotAssign: true },
    }),
  ])
  return !((profile ? !profile.isActive : false) || membership?.doNotAssign)
}

export async function isMemberAvailableNow(userId: string, subDepartmentId: string): Promise<boolean> {
  // 1. availability — check both profile-level isActive (all roles) and team-level doNotAssign (per-team override)
  const [profile, membership] = await Promise.all([
    prisma.profile.findUnique({
      where: { id: userId },
      select: { timezone: true, isActive: true },
    }),
    prisma.subDepartmentMembership.findUnique({
      where: { userId_subDepartmentId: { userId, subDepartmentId } },
      select: { doNotAssign: true },
    }),
  ])
  if ((profile ? !profile.isActive : false) || membership?.doNotAssign) return false

  // 2. Holiday check (in member's own timezone)
  const tz = safeTimezone(profile?.timezone)
  const todayStr = getTodayStringInTz(tz)

  const holiday = await prisma.memberHoliday.findFirst({
    where: {
      userId,
      date: { gte: new Date(todayStr), lt: new Date(todayStr + "T23:59:59.999Z") },
    },
    select: { id: true },
  })
  if (holiday) return false

  // 3. Working days + hours
  const schedule = await prisma.memberSchedule.findUnique({ where: { userId } })
  if (schedule) {
    const { dayOfWeek, time } = getNowInTz(tz)
    if (!schedule.workingDays.includes(dayOfWeek)) return false
    if (time < schedule.workStartTime || time >= schedule.workEndTime) return false
  }

  return true
}

// ─── Shared helpers (slice 11: also power lib/assignment-engine.ts's ─────────
// ROUND_ROBIN / WORKLOAD_BASED methods, so the pool/counting logic lives in
// exactly one place) ───────────────────────────────────────────────────────

/**
 * Active subDepartment members, schedule-availability-aware, ordered consistently
 * (joinedAt asc), excluding `excludeUserId` (typically the department
 * manager, who doesn't work tickets). Returns [] when no member is inside
 * working hours (ASG-04 / WH-03).
 * `agentsOnly` restricts automatic round-robin/workload assignment to agents,
 * excluding scoped department managers even if they retain an agent membership.
 */
export async function getEligibleMembers(
  subDepartmentId: string,
  excludeUserId: string | null,
  agentsOnly = false,
): Promise<{ userId: string }[]> {
  const allMembers = (
    await prisma.subDepartmentMembership.findMany({
      where: {
        subDepartmentId,
        isActive: true,
        ...(agentsOnly ? {
          role: "agent" as const,
          user: {
            role: "agent" as const,
            managedDepartments: {
              none: { department: { subDepartments: { some: { id: subDepartmentId } } } },
            },
          },
        } : {}),
      },
      orderBy: { joinedAt: "asc" },
      select: { userId: true },
    })
  ).filter((m) => m.userId !== excludeUserId)

  if (allMembers.length === 0) return []

  const availabilityFlags = await Promise.all(
    allMembers.map((m) => isMemberAvailableNow(m.userId, subDepartmentId)),
  )
  return allMembers.filter((_, i) => availabilityFlags[i])
}

/** Open (non-deleted, non-completed-status) ticket count per user, for workload balancing. */
export async function getOpenTicketCounts(
  subDepartmentId: string,
  userIds: string[],
): Promise<{ userId: string; count: number }[]> {
  const completionStatuses = await prisma.subDepartmentStatus.findMany({
    where: { subDepartmentId, category: "COMPLETE" },
    select: { label: true },
  })
  const completedLabels = completionStatuses.map((s) => s.label)

  return Promise.all(
    userIds.map(async (userId) => {
      const count = await prisma.ticket.count({
        where: {
          subDepartmentId,
          assigneeId: userId,
          deletedAt: null,
          ...(completedLabels.length > 0 ? { status: { notIn: completedLabels } } : {}),
        },
      })
      return { userId, count }
    }),
  )
}

// ─── Core ROTA algorithm (hybrid round-robin + workload threshold) ───────────

export async function resolveAssignee(
  subDepartmentId: string,
  rotaPointer: number,
  workloadThreshold: number,
  excludeUserId: string | null,
): Promise<{ userId: string | null; nextPointer: number }> {
  const allMembers = await prisma.subDepartmentMembership.findMany({
    where: { subDepartmentId, isActive: true },
    orderBy: { joinedAt: "asc" },
    select: { userId: true },
  }).then((rows) => rows.filter((m) => m.userId !== excludeUserId))

  if (allMembers.length === 0) return { userId: null, nextPointer: rotaPointer }

  const eligible = await getEligibleMembers(subDepartmentId, excludeUserId)
  const openCounts = await getOpenTicketCounts(subDepartmentId, eligible.map((e) => e.userId))

  const total = eligible.length
  // rotaPointer is relative to allMembers; translate to eligible index
  const start = rotaPointer % total

  // Walk forward from start; pick first member under threshold
  for (let i = 0; i < total; i++) {
    const idx = (start + i) % total
    if (openCounts[idx].count < workloadThreshold) {
      return {
        userId: eligible[idx].userId,
        nextPointer: (allMembers.findIndex((m) => m.userId === eligible[idx].userId) + 1) % allMembers.length,
      }
    }
  }

  // All over threshold — assign to the member with the fewest open tickets
  const leastLoaded = openCounts.reduce((a, b) => (a.count <= b.count ? a : b))
  const globalIdx = allMembers.findIndex((m) => m.userId === leastLoaded.userId)
  return {
    userId: leastLoaded.userId,
    nextPointer: (globalIdx + 1) % allMembers.length,
  }
}
