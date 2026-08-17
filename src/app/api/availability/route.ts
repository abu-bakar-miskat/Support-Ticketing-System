import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { getUnavailabilityByUserIds } from "@/lib/availability"

/**
 * GET /api/availability
 * Optional ?ids=a,b,c — when omitted, returns everyone currently on holiday.
 * Any authenticated user can read this (needed for board/ticket avatars).
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  const idsParam = req.nextUrl.searchParams.get("ids")
  const userIds = idsParam
    ? [...new Set(idsParam.split(",").map((s) => s.trim()).filter(Boolean))]
    : undefined

  const map = await getUnavailabilityByUserIds(userIds)
  return NextResponse.json(map)
}
