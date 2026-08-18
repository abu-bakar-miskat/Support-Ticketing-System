import { NextRequest, NextResponse } from "next/server"
import { sweepStuckReportExportJobs } from "@/lib/reporting/report-export-job"
import { withSystemScope } from "@/lib/request-scope"

// Vercel Cron Jobs invoke routes via GET with an Authorization header.
// RPT-05: resumes any large-report export whose `after()` kick-off never
// finished — see lib/reporting/report-export-job.ts.
export const GET = withSystemScope(handleGet)

async function handleGet(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }

  const auth = request.headers.get("authorization")
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const resumed = await sweepStuckReportExportJobs()
  console.log(`[report-export-sweep] resumed ${resumed} stuck jobs`)

  return NextResponse.json({ ok: true, resumed })
}
