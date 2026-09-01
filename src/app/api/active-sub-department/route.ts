import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { SUBDEPT_SLUG_COOKIE } from "@/lib/tenant-path"

export async function POST(req: NextRequest) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { subDepartmentId } = await req.json()

  let allowed = profile.subDepartmentIds.includes(subDepartmentId) || profile.role === "admin"

  // Managers are virtual members of every subDepartment in their managed departments
  if (!allowed && profile.role === "manager") {
    const managedIds: string[] = (profile as any).managedDepartmentIds ?? []
    if (managedIds.length > 0) {
      const subDepartment = await prisma.subDepartment.findUnique({
        where: { id: subDepartmentId },
        select: { departmentId: true },
      })
      if (subDepartment?.departmentId && managedIds.includes(subDepartment.departmentId)) {
        allowed = true
      }
    }
  }

  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const target = subDepartmentId
    ? await prisma.subDepartment.findUnique({
        where: { id: subDepartmentId },
        select: { slug: true },
      })
    : null
  const subDeptSlug = target?.slug ?? ""

  const res = NextResponse.json({ ok: true, slug: subDeptSlug })
  res.cookies.set("pen_active_team", subDepartmentId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  })
  // Mirror the sub-dept slug for /<tenant>/<dept>/<subdept>/… URLs.
  res.cookies.set(SUBDEPT_SLUG_COOKIE, subDeptSlug, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
