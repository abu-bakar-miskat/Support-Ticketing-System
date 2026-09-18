import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"

/**
 * Search all profiles by name/email for the Create Tenant modal's "Add
 * tenant admin" picker. Unlike GET /api/admin/tenants/[id]/members (which
 * excludes existing members of one tenant), there's no tenant yet at this
 * point, so this is a plain cross-tenant search — super-admin only.
 *
 * Pass `excludeTenantAdmins=1` to hide anyone who already administers a
 * tenant (tenant-admin is exclusive across organisations). The platform
 * super-admin picker leaves this unset so tenant admins can still be elevated.
 */
export async function GET(request: NextRequest) {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim()
  if (q.length < 2) return NextResponse.json({ users: [] })

  const excludeTenantAdmins =
    request.nextUrl.searchParams.get("excludeTenantAdmins") === "1" ||
    request.nextUrl.searchParams.get("excludeTenantAdmins") === "true"

  const users = await prisma.profile.findMany({
    where: {
      deletedAt: null,
      ...(excludeTenantAdmins
        ? { tenantMemberships: { none: { role: "admin", isActive: true } } }
        : {}),
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
