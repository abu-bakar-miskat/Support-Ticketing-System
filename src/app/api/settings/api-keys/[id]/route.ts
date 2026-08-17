import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager } from "@/lib/auth"
import { prisma } from "@/lib/db"

// DELETE /api/settings/api-keys/:id — revoke a key
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, isAdmin, error } = await requireAdminOrManager()
  if (error) return error

  const { id } = await params

  const key = await prisma.apiKey.findUnique({
    where: { id },
    select: { id: true, createdById: true, departmentId: true, revokedAt: true },
  })

  if (!key) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 })
  }

  if (key.revokedAt !== null) {
    return NextResponse.json({ error: "Key is already revoked" }, { status: 409 })
  }

  // Managers can only revoke keys for their own departments or keys they created
  if (!isAdmin) {
    const managed: string[] = (profile as any).managedDepartmentIds ?? []
    const ownsKey = key.createdById === profile.id
    const inDept = key.departmentId !== null && managed.includes(key.departmentId)
    if (!ownsKey && !inDept) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  await prisma.apiKey.update({
    where: { id },
    data: { revokedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
