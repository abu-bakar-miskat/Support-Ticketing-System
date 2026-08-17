import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error

  const header = "name,goal,startDate,endDate,pointsTarget"
  const sample1 = "Sprint 1,Deliver user authentication,2026-07-01,2026-07-14,40"
  const sample2 = "Sprint 2,Build dashboard & reports,2026-07-15,2026-07-28,50"
  const csv = [header, sample1, sample2].join("\n")

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="sprint-import-template.csv"',
    },
  })
}
