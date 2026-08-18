import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/auth"
import { departmentIdInScope } from "@/lib/dept-scope"
import { createNotification } from "@/lib/notify"

// POST — user requests to join a department
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id: departmentId } = await params
  const body = await req.json().catch(() => ({}))

  const department = await prisma.department.findUnique({ where: { id: departmentId } })
  if (!department) return NextResponse.json({ error: "Department not found" }, { status: 404 })

  // Already in a team under this department
  const existing = await prisma.subDepartmentMembership.findFirst({
    where: { userId: profile.id, subDepartment: { departmentId }, isActive: true },
  })
  if (existing) return NextResponse.json({ error: "Already a member of this department" }, { status: 409 })

  // Already has a pending request for this department
  const pendingReq = await prisma.joinRequest.findFirst({
    where: { userId: profile.id, departmentId, status: "pending" },
  })
  if (pendingReq) return NextResponse.json({ error: "Request already pending" }, { status: 409 })

  const joinRequest = await prisma.joinRequest.create({
    data: {
      userId: profile.id,
      departmentId,
      message: (body as { message?: string }).message ?? null,
    },
  })

  // Notify managers of this dept + all admins with realtime broadcast
  const [deptManagers, admins] = await Promise.all([
    prisma.departmentManager.findMany({
      where: { departmentId },
      select: { userId: true },
    }),
    prisma.profile.findMany({ where: { role: "admin" }, select: { id: true } }),
  ])

  const recipientIds = [
    ...new Set([...deptManagers.map((m) => m.userId), ...admins.map((a) => a.id)]),
  ].filter((id) => id !== profile.id)

  await Promise.all(
    recipientIds.map((recipientId) =>
      createNotification({
        recipientId,
        actorId: profile.id,
        type: "join_request",
        joinRequestId: joinRequest.id,
        message: `${profile.name} wants to join ${department.name}`,
      }),
    ),
  )

  return NextResponse.json(joinRequest, { status: 201 })
}

// GET — list pending join requests for a department (manager/admin only)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  if (profile.role !== "admin" && profile.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: departmentId } = await params

  if (!(await departmentIdInScope(profile, departmentId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const requests = await prisma.joinRequest.findMany({
    where: { departmentId, status: "pending" },
    orderBy: { requestedAt: "asc" },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      department: { select: { id: true, name: true, subDepartments: { select: { id: true, name: true }, orderBy: { name: "asc" } } } },
    },
  })

  return NextResponse.json(requests)
}
