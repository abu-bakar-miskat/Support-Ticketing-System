import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/auth"

// POST - any authenticated user requests to join a team
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id: subDepartmentId } = await params
  const body = await req.json().catch(() => ({}))

  // Check team exists
  const subDepartment = await prisma.subDepartment.findUnique({ where: { id: subDepartmentId } })
  if (!subDepartment) return NextResponse.json({ error: "Team not found" }, { status: 404 })

  // Check if already a member
  const existing = await prisma.subDepartmentMembership.findUnique({
    where: { userId_subDepartmentId: { userId: profile.id, subDepartmentId } },
  })
  if (existing) return NextResponse.json({ error: "Already a member" }, { status: 409 })

  // Check if already has a pending request
  const pendingReq = await prisma.joinRequest.findFirst({
    where: { userId: profile.id, subDepartmentId, status: "pending" },
  })
  if (pendingReq) return NextResponse.json({ error: "Request already pending" }, { status: 409 })

  const joinRequest = await prisma.joinRequest.create({
    data: {
      userId: profile.id,
      subDepartmentId,
      message: (body as { message?: string }).message ?? null,
    },
  })

  // Collect recipient IDs: team managers + all global admins (deduped, exclude requester)
  const [subDepartmentManagers, adminProfiles] = await Promise.all([
    prisma.subDepartmentMembership.findMany({
      where: { subDepartmentId, role: { in: ["manager", "lead"] }, isActive: true },
      select: { userId: true },
    }),
    prisma.profile.findMany({
      where: { role: "admin" },
      select: { id: true },
    }),
  ])

  const recipientIds = [
    ...new Set([
      ...subDepartmentManagers.map((m) => m.userId),
      ...adminProfiles.map((a) => a.id),
    ]),
  ].filter((id) => id !== profile.id)

  if (recipientIds.length > 0) {
    await prisma.notification.createMany({
      data: recipientIds.map((recipientId) => ({
        recipientId,
        actorId: profile.id,
        type: "join_request" as const,
        joinRequestId: joinRequest.id,
        message: `${profile.name} wants to join ${subDepartment.name}`,
      })),
    })
  }

  return NextResponse.json(joinRequest, { status: 201 })
}

// GET - manager/admin lists pending join requests for their team
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id: subDepartmentId } = await params

  // Must be admin or manager of this team
  if (profile.role !== "admin") {
    const membership = await prisma.subDepartmentMembership.findUnique({
      where: { userId_subDepartmentId: { userId: profile.id, subDepartmentId } },
    })
    if (!membership || (membership.role !== "manager" && membership.role !== "lead")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const requests = await prisma.joinRequest.findMany({
    where: { subDepartmentId, status: "pending" },
    orderBy: { requestedAt: "asc" },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  })

  return NextResponse.json(requests)
}
