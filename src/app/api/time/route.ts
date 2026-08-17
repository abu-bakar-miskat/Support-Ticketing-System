import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { ticketsInScope } from "@/lib/dept-scope"
import { broadcastTimerChange } from "@/lib/timer-broadcast"
import { appendTicketEvent, broadcastTicketEvent } from "@/lib/ticket-events"

type EntryKind = "DEVELOPMENT" | "QA"

function durationSecsBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000))
}

function parseKind(value: unknown): EntryKind {
  return value === "QA" ? "QA" : "DEVELOPMENT"
}

async function broadcastTicketTimer(
  ticketId: string | null | undefined,
  actorId: string,
  actorName: string,
  actorAvatarUrl: string | null,
  kind: "start" | "stop",
  entry: {
    id: string
    startedAt: Date
    endedAt?: Date | null
    durationSecs?: number | null
    kind?: EntryKind
  },
) {
  if (!ticketId) return
  const entryKind = entry.kind ?? "DEVELOPMENT"
  if (kind === "start") {
    await broadcastTicketEvent(ticketId, "TIMER_STARTED", actorId, {
      userId: actorId,
      userName: actorName,
      avatarUrl: actorAvatarUrl,
      entryId: entry.id,
      startedAt: entry.startedAt.toISOString(),
      kind: entryKind,
    })
    return
  }
  const endedAt = entry.endedAt ?? new Date()
  const durationSecs =
    entry.durationSecs ?? durationSecsBetween(entry.startedAt, endedAt)
  await broadcastTicketEvent(ticketId, "TIMER_STOPPED", actorId, {
    userId: actorId,
    userName: actorName,
    entryId: entry.id,
    durationSecs,
    endedAt: endedAt.toISOString(),
    kind: entryKind,
  })
}

export async function GET() {
  const { profile, error } = await requireAuth()
  if (error) return error

  const running = await prisma.timeEntry.findFirst({
    where: { profileId: profile.id, endedAt: null },
    select: {
      id: true,
      ticketId: true,
      startedAt: true,
      note: true,
      kind: true,
      ticket: {
        select: {
          title: true,
          ticketNumber: true,
          team: { select: { prefix: true } },
        },
      },
    },
    orderBy: { startedAt: "desc" },
  })

  if (!running) return NextResponse.json(null)

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayTaskRows = await prisma.timeEntry.findMany({
    where: {
      profileId: profile.id,
      startedAt: { gte: startOfToday },
      ticketId: { not: null },
      kind: "DEVELOPMENT",
    },
    select: { ticketId: true },
    distinct: ["ticketId"],
  })

  return NextResponse.json({
    entryId: running.id,
    ticketDbId: running.ticketId,
    startedAtMs: running.startedAt.getTime(),
    kind: running.kind,
    ticketHumanId: running.ticket
      ? `${running.ticket.team.prefix}-${running.ticket.ticketNumber}`
      : null,
    ticketTitle: running.ticket?.title ?? running.note ?? null,
    todayTaskCount: todayTaskRows.length,
  })
}

export async function POST(request: NextRequest) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const { action, ticketId, entryId, durationMins, note, kind: rawKind } = body as {
    action?: string
    ticketId?: string
    entryId?: string
    durationMins?: number
    note?: string
    kind?: string
  }

  if (action === "start") {
    const kind = parseKind(rawKind)

    if (ticketId) {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: {
          id: true,
          deletedAt: true,
          qaAssignees: kind === "QA"
            ? { where: { userId: profile.id }, select: { userId: true } }
            : false,
        },
      })
      if (!ticket || ticket.deletedAt !== null) {
        return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
      }
      if (!(await ticketsInScope(profile, [ticketId]))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      if (kind === "QA") {
        const qaRows = ticket.qaAssignees as { userId: string }[] | false
        if (!qaRows || qaRows.length === 0) {
          return NextResponse.json(
            { error: "Only QA assignees can start a QA timer" },
            { status: 403 },
          )
        }
      }
    } else if (kind === "QA") {
      return NextResponse.json(
        { error: "ticketId is required for QA timers" },
        { status: 400 },
      )
    }

    const now = new Date()
    const { entry, closed } = await prisma.$transaction(async (tx) => {
      // Close any running timers (dev or QA) before starting a new one
      const running = await tx.timeEntry.findMany({
        where: { profileId: profile.id, endedAt: null },
        select: { id: true, startedAt: true, ticketId: true, kind: true },
      })
      const closedEntries: {
        id: string
        startedAt: Date
        endedAt: Date
        durationSecs: number
        ticketId: string | null
        kind: EntryKind
      }[] = []
      for (const open of running) {
        const durationSecs = durationSecsBetween(open.startedAt, now)
        await tx.timeEntry.update({
          where: { id: open.id },
          data: { endedAt: now, durationSecs },
        })
        closedEntries.push({
          id: open.id,
          startedAt: open.startedAt,
          endedAt: now,
          durationSecs,
          ticketId: open.ticketId,
          kind: open.kind as EntryKind,
        })
      }
      const created = await tx.timeEntry.create({
        data: {
          profileId: profile.id,
          ticketId: ticketId ?? null,
          startedAt: now,
          billable: true,
          kind,
        },
      })
      return { entry: created, closed: closedEntries }
    })

    await broadcastTimerChange(profile.id)
    await Promise.all([
      ...closed.map((c) =>
        broadcastTicketTimer(
          c.ticketId,
          profile.id,
          profile.name,
          profile.avatarUrl ?? null,
          "stop",
          c,
        ).catch(() => undefined),
      ),
      broadcastTicketTimer(
        ticketId,
        profile.id,
        profile.name,
        profile.avatarUrl ?? null,
        "start",
        entry,
      ).catch(() => undefined),
    ])
    return NextResponse.json(entry, { status: 201 })
  }

  if (action === "stop") {
    // If a specific entryId is provided, check if it already ended (idempotent stop)
    if (entryId) {
      const specific = await prisma.timeEntry.findFirst({
        where: { id: entryId, profileId: profile.id },
      })
      if (specific?.endedAt) {
        await broadcastTimerChange(profile.id)
        await broadcastTicketTimer(
          specific.ticketId,
          profile.id,
          profile.name,
          profile.avatarUrl ?? null,
          "stop",
          specific,
        ).catch(() => undefined)
        return NextResponse.json(specific)
      }
    }

    const running = await prisma.timeEntry.findFirst({
      where: {
        profileId: profile.id,
        endedAt: null,
        ...(entryId ? { id: entryId } : {}),
      },
      orderBy: { startedAt: "desc" },
    })

    if (!running) {
      return NextResponse.json({ error: "No running timer" }, { status: 404 })
    }

    const now = new Date()
    const updated = await prisma.timeEntry.update({
      where: { id: running.id },
      data: { endedAt: now, durationSecs: durationSecsBetween(running.startedAt, now) },
    })

    await broadcastTimerChange(profile.id)
    await broadcastTicketTimer(
      running.ticketId,
      profile.id,
      profile.name,
      profile.avatarUrl ?? null,
      "stop",
      updated,
    ).catch(() => undefined)
    return NextResponse.json(updated)
  }

  // Reset the caller's DEVELOPMENT time on a ticket (own laps only) to 0.
  if (action === "reset") {
    if (!ticketId) {
      return NextResponse.json({ error: "ticketId is required" }, { status: 400 })
    }
    if (!(await ticketsInScope(profile, [ticketId]))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const entries = await prisma.timeEntry.findMany({
      where: { ticketId, profileId: profile.id, kind: "DEVELOPMENT" },
      select: { id: true, startedAt: true, endedAt: true, durationSecs: true },
    })
    if (entries.length === 0) {
      return NextResponse.json({ clearedSecs: 0, entryCount: 0 })
    }

    const now = new Date()
    let clearedSecs = 0
    for (const e of entries) {
      if (e.endedAt && e.durationSecs != null) {
        clearedSecs += e.durationSecs
      } else if (!e.endedAt) {
        clearedSecs += durationSecsBetween(e.startedAt, now)
      }
    }

    const hadRunning = entries.some((e) => !e.endedAt)
    await prisma.timeEntry.deleteMany({
      where: { ticketId, profileId: profile.id, kind: "DEVELOPMENT" },
    })

    if (hadRunning) {
      await broadcastTimerChange(profile.id)
    }

    await appendTicketEvent(ticketId, profile.id, "TIMER_RESET", {
      clearedSecs,
      entryCount: entries.length,
    }).catch(() => undefined)

    return NextResponse.json({ clearedSecs, entryCount: entries.length })
  }

  // Manual QA time log — completed entry (kept for API clients; UI uses start/stop).
  if (action === "log") {
    if (!ticketId) {
      return NextResponse.json({ error: "ticketId is required" }, { status: 400 })
    }
    const mins =
      typeof durationMins === "number" && Number.isFinite(durationMins)
        ? Math.floor(durationMins)
        : NaN
    if (!Number.isFinite(mins) || mins <= 0 || mins > 24 * 60) {
      return NextResponse.json(
        { error: "durationMins must be a positive number (max 24h)" },
        { status: 400 },
      )
    }
    if (!(await ticketsInScope(profile, [ticketId]))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        deletedAt: true,
        qaAssignees: { where: { userId: profile.id }, select: { userId: true } },
      },
    })
    if (!ticket || ticket.deletedAt !== null) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    }
    if (ticket.qaAssignees.length === 0) {
      return NextResponse.json(
        { error: "Only QA assignees can log QA time" },
        { status: 403 },
      )
    }

    const durationSecs = mins * 60
    const endedAt = new Date()
    const startedAt = new Date(endedAt.getTime() - durationSecs * 1000)
    const trimmedNote = typeof note === "string" ? note.trim().slice(0, 500) : ""

    const entry = await prisma.timeEntry.create({
      data: {
        profileId: profile.id,
        ticketId,
        startedAt,
        endedAt,
        durationSecs,
        billable: true,
        kind: "QA",
        note: trimmedNote || null,
      },
    })

    await appendTicketEvent(ticketId, profile.id, "QA_TIME_LOGGED", {
      durationSecs,
      note: trimmedNote || null,
      entryId: entry.id,
    }).catch(() => undefined)

    return NextResponse.json(entry, { status: 201 })
  }

  return NextResponse.json(
    { error: 'Invalid action — expected "start", "stop", "reset", or "log"' },
    { status: 400 },
  )
}
