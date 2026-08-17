import { NextResponse } from "next/server"
import { getProfile } from "@/lib/profile"
import { prisma } from "@/lib/db"
import { badRequest, unauthorized } from "@/lib/api-response"
import type { Prisma } from "@/generated/prisma/client"

// Saved task-list views live inside the per-user preferences JSON blob under
// `savedViews`, so no schema migration is needed. Every write merges into the
// existing blob to preserve signature/pinnedProjectIds/etc.

export type SavedViewFilters = {
  status?: string[]
  priority?: string[]
  projectId?: string[]
  assigneeId?: string[]
  moduleId?: string[]
  labels?: string[]
  source?: "intake" | "manual"
  sort?: string
  search?: string
  dateFrom?: string
  dateTo?: string
  targetDateFrom?: string
  targetDateTo?: string
}

export type SavedView = {
  id: string
  name: string
  filters: SavedViewFilters
  createdAt: string
}

const MAX_VIEWS = 30

function readPrefsObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  return { ...(raw as Record<string, unknown>) }
}

function parseViews(raw: unknown): SavedView[] {
  const prefs = readPrefsObject(raw)
  const list = prefs.savedViews
  if (!Array.isArray(list)) return []
  return list.filter(
    (v): v is SavedView =>
      !!v && typeof v === "object" && typeof (v as SavedView).id === "string" && typeof (v as SavedView).name === "string",
  )
}

const STR_ARRAY_KEYS = ["status", "priority", "projectId", "assigneeId", "moduleId", "labels"] as const
const STR_KEYS = ["sort", "search", "dateFrom", "dateTo", "targetDateFrom", "targetDateTo"] as const

function sanitizeFilters(raw: unknown): SavedViewFilters {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const r = raw as Record<string, unknown>
  const out: SavedViewFilters = {}
  for (const key of STR_ARRAY_KEYS) {
    const val = r[key]
    if (Array.isArray(val)) {
      const strs = val.filter((x): x is string => typeof x === "string").slice(0, 100)
      if (strs.length) out[key] = strs
    }
  }
  for (const key of STR_KEYS) {
    const val = r[key]
    if (typeof val === "string" && val) out[key] = val.slice(0, 200)
  }
  if (r.source === "intake" || r.source === "manual") out.source = r.source
  return out
}

async function persist(profileId: string, prefs: Record<string, unknown>, views: SavedView[]) {
  prefs.savedViews = views
  await prisma.profile.update({
    where: { id: profileId },
    data: { preferences: prefs as Prisma.InputJsonValue },
  })
}

export async function GET() {
  const profile = await getProfile()
  if (!profile) return unauthorized()

  const row = await prisma.profile.findUnique({
    where: { id: profile.id },
    select: { preferences: true },
  })
  return NextResponse.json({ views: parseViews(row?.preferences) })
}

export async function POST(req: Request) {
  const profile = await getProfile()
  if (!profile) return unauthorized()

  const body = await req.json().catch(() => ({}))
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : ""
  if (!name) return badRequest("A view name is required.")

  const row = await prisma.profile.findUnique({
    where: { id: profile.id },
    select: { preferences: true },
  })
  const prefs = readPrefsObject(row?.preferences)
  const views = parseViews(row?.preferences)

  if (views.length >= MAX_VIEWS) {
    return badRequest(`You can save at most ${MAX_VIEWS} views.`)
  }

  const filters = sanitizeFilters(body?.filters)
  const existing = views.find((v) => v.name.toLowerCase() === name.toLowerCase())

  let saved: SavedView
  if (existing) {
    // Same name overwrites — matches the "update this view" mental model.
    existing.filters = filters
    saved = existing
  } else {
    saved = { id: crypto.randomUUID(), name, filters, createdAt: new Date().toISOString() }
    views.push(saved)
  }

  await persist(profile.id, prefs, views)
  return NextResponse.json({ view: saved, views })
}

export async function DELETE(req: Request) {
  const profile = await getProfile()
  if (!profile) return unauthorized()

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return badRequest("A view id is required.")

  const row = await prisma.profile.findUnique({
    where: { id: profile.id },
    select: { preferences: true },
  })
  const prefs = readPrefsObject(row?.preferences)
  const views = parseViews(row?.preferences).filter((v) => v.id !== id)

  await persist(profile.id, prefs, views)
  return NextResponse.json({ views })
}
