import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { forbidden } from "@/lib/api-response"
import { canManageDeptCalendar } from "@/lib/dept-scope"

// DELETE /api/departments/[id]/holidays/[holidayId] — remove a department holiday.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; holidayId: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id: departmentId, holidayId } = await params
  if (!canManageDeptCalendar(profile, departmentId)) {
    return forbidden("Only managers of this department can edit its calendar.")
  }

  const result = await prisma.departmentHoliday.deleteMany({
    where: { id: holidayId, departmentId },
  })
  if (result.count === 0) {
    return NextResponse.json({ error: "Holiday not found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
