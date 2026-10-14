import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requirePortalKeyAdmin } from "@/lib/portal-key-admin"

// DELETE /api/settings/api-keys/:id/submissions/:submissionId — tenant admins
// only. Removes the submission record; a ticket created from it is kept.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; submissionId: string }> },
) {
  const { id, submissionId } = await params
  const auth = await requirePortalKeyAdmin(id)
  if (auth.error || !auth.key) return auth.error

  // Keep historical submissions accessible after the linked form changes.
  const { count } = await prisma.intake.deleteMany({
    where: { id: submissionId, apiKeyId: auth.key.id },
  })
  if (count === 0) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
