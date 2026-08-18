import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function POST(req: NextRequest) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { subDepartmentId } = await req.json()

  let allowed = profile.subDepartmentIds.includes(subDepartmentId) || profile.role === "admin"

  // Managers are virtual members of every team in their managed departments
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

  const res = NextResponse.json({ ok: true })
  res.cookies.set("pen_active_team", subDepartmentId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
