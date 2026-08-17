import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Baked in at build time on Vercel — changes exactly when a new deploy goes
// live, which is what stale open tabs need to detect.
const BUILD =
  process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? "dev"

export async function GET() {
  return NextResponse.json(
    { build: BUILD },
    { headers: { "Cache-Control": "no-store" } },
  )
}
