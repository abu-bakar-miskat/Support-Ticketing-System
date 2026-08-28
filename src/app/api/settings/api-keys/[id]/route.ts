import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { prisma } from "@/lib/db"

// DELETE /api/settings/api-keys/:id — revoke a key
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin()
  if (error) return error

  const { id } = await params

  const key = await prisma.apiKey.findUnique({
    where: { id },
    select: { id: true, revokedAt: true },
  })

  if (!key) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 })
  }

  if (key.revokedAt !== null) {
    return NextResponse.json({ error: "Key is already revoked" }, { status: 409 })
  }

  await prisma.apiKey.update({
    where: { id },
    data: { revokedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
