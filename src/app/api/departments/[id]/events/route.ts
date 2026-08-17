import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { forbidden } from "@/lib/api-response"
import { canManageDeptCalendar } from "@/lib/dept-scope"

const VALID_TYPES = new Set(["birthday", "anniversary", "meeting", "other"])

// POST /api/departments/[id]/events — add a department calendar event.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id: departmentId } = await params
  if (!canManageDeptCalendar(profile, departmentId)) {
    return forbidden("Only managers of this department can edit its calendar.")
  }

  const body = await req.json()
  const title = typeof body.title === "string" ? body.title.trim() : ""
  const type = typeof body.type === "string" && VALID_TYPES.has(body.type) ? body.type : "other"
  const { startDate, endDate } = body as { startDate?: string; endDate?: string }

  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 })
  if (!startDate) return NextResponse.json({ error: "startDate is required" }, { status: 400 })

  const start = new Date(startDate)
  const end = new Date(endDate ?? startDate)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 })
  }
  if (end < start) {
    return NextResponse.json({ error: "endDate must not be before startDate" }, { status: 400 })
  }

  const event = await prisma.departmentEvent.create({
    data: { departmentId, title, type, startDate: start, endDate: end, createdBy: profile.id },
  })

  return NextResponse.json(event, { status: 201 })
}
