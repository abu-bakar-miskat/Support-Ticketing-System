import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { needsWalkthroughOverview, dismissWalkthroughOverview } from "@/lib/department-setup"

// DS-09/10: whether the caller should see the dismissible setup overview for
// this (already-active) department. The overview content itself is static
// UI — this only answers whether to auto-show it; DS-10's "available on
// demand at any step" is satisfied by the UI being able to open it
// regardless of this flag.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id: departmentId } = await params
  const needsOverview = await needsWalkthroughOverview(profile!.id, departmentId)
  return NextResponse.json({ needsOverview })
}

// DS-09: dismisses the overview for the calling user's own DepartmentManager row.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id: departmentId } = await params
  await dismissWalkthroughOverview(profile!.id, departmentId)
  return NextResponse.json({ ok: true })
}
