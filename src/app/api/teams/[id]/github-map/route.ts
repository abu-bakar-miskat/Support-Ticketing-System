import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { canReadTeamData } from "@/lib/dept-scope"
import { canManageTeam } from "@/lib/team-manage"
import {
  resolveTargetLabel,
  type GitHubStatusEvent,
  type TeamGitHubMapRow,
} from "@/lib/github/status-map"

const EVENTS: GitHubStatusEvent[] = ["prOpened", "prReadyForReview", "prMerged"]
const FIELDS = ["onPrOpened", "onPrReadyForReview", "onPrMerged"] as const

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error
  const { id } = await params
  if (!(await canReadTeamData(profile, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const statuses = await prisma.teamStatus.findMany({
    where: { teamId: id },
    orderBy: { order: "asc" },
    select: { label: true, order: true, isComplete: true },
  })
  const config = await prisma.teamGitHubStatusMap.findUnique({ where: { teamId: id } })

  const defaults = Object.fromEntries(
    EVENTS.map((e) => [e, resolveTargetLabel(e, statuses, null)]),
  )
  return NextResponse.json({ config, defaults })
}

export async function PUT(
  request: NextRequest | Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error
  const { id } = await params
  if (!(await canManageTeam(profile, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as Partial<TeamGitHubMapRow> | null
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const statuses = await prisma.teamStatus.findMany({
    where: { teamId: id },
    select: { label: true },
  })
  const labels = new Set(statuses.map((s) => s.label))

  const data: Record<string, string | null> = {}
  for (const field of FIELDS) {
    if (!(field in body)) continue
    const value = body[field]
    if (value === null || value === "") {
      data[field] = value
    } else if (typeof value === "string" && labels.has(value)) {
      data[field] = value
    } else {
      return NextResponse.json(
        { error: `Unknown status label for ${field}: ${String(value)}` },
        { status: 400 },
      )
    }
  }

  const saved = await prisma.teamGitHubStatusMap.upsert({
    where: { teamId: id },
    create: { teamId: id, ...data },
    update: data,
  })
  return NextResponse.json(saved)
}
