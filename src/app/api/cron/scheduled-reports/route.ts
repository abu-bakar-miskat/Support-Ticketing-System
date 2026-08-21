import { NextRequest, NextResponse } from "next/server"
import { runDueReportSchedules } from "@/lib/reporting/report-schedule"
import { withSystemScope } from "@/lib/request-scope"

// Vercel Cron invokes via GET with an Authorization header.
// RPT-06: generates a downloadable ReportExportJob for each due schedule.
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

  const ran = await runDueReportSchedules()
  console.log(`[scheduled-reports] generated ${ran} scheduled report(s)`)

  return NextResponse.json({ ok: true, ran })
}
