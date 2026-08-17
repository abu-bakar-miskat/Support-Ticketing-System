import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"

/** Marks one mention (body: { id }) or all of the caller's mentions (body: { all: true }) as read. */
export async function POST(request: NextRequest) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const { id, all } = body as { id?: string; all?: boolean }

  if (!id && !all) {
    return NextResponse.json({ error: "id or all is required" }, { status: 400 })
  }

  const { count } = await prisma.mention.updateMany({
    where: {
      mentionedUserId: profile.id,
      readAt: null,
      ...(id ? { id } : {}),
    },
    data: { readAt: new Date() },
  })

  return NextResponse.json({ updated: count })
}
