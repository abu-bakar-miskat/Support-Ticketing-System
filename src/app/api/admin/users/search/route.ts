import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"

/**
 * Search all profiles by name/email for the Create Tenant modal's "Add
 * tenant admin" picker. Unlike GET /api/admin/tenants/[id]/members (which
 * excludes existing members of one tenant), there's no tenant yet at this
 * point, so this is a plain cross-tenant search — super-admin only.
 */
export async function GET(request: NextRequest) {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim()
  if (q.length < 2) return NextResponse.json({ users: [] })

  const users = await prisma.profile.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, email: true, avatarUrl: true },
    orderBy: { name: "asc" },
    take: 8,
  })
  return NextResponse.json({ users })
}
