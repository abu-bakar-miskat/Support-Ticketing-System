import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { fetchProfileStats } from "@/lib/profile-stats"

export async function GET(req: NextRequest) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const sp = req.nextUrl.searchParams
  const targetId = sp.get("userId") ?? profile!.id
  const projectId = sp.get("projectId") ?? undefined
  const toDate = sp.get("to") ? new Date(sp.get("to")!) : new Date()
  const fromDate = sp.get("from")
    ? new Date(sp.get("from")!)
    : new Date(Date.now() - 30 * 86400_000)

  const result = await fetchProfileStats({
    viewer: profile!,
    targetId,
    fromDate,
    toDate,
    projectId,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(result.data)
}
