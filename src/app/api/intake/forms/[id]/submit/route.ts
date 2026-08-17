import { NextRequest, NextResponse } from "next/server"

// This path is a legacy stub. Redirect all submissions to the canonical
// endpoint at /api/support/[uuid]/submit which runs the full ROTA flow.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const canonical = new URL(`/api/support/${id}/submit`, request.url)
  return NextResponse.redirect(canonical, 308) // 308 preserves POST + body
}
