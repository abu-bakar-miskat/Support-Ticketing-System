import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/auth"
import {
  assertUsersEligibleForProjectDepartment,
  fetchProjectDepartmentPeople,
} from "@/lib/project-department-people"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth()
  if (error) return error

  const { id } = await params

  const project = await prisma.project.findFirst({
    where: { OR: [{ slug: id }, { id }] },
    select: {
      id: true,
      departmentId: true,
      subDepartment: { select: { departmentId: true } },
      members: {
        select: {
          user: { select: { id: true, name: true, avatarUrl: true, role: true } },
        },
      },
    },
  })

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const projectDeptId = project.departmentId ?? project.subDepartment?.departmentId ?? null
  const memberIds = new Set(project.members.map((m) => m.user.id))
  const eligible = await fetchProjectDepartmentPeople(projectDeptId)
  const eligibleById = new Map(eligible.map((p) => [p.id, p]))

  const members = project.members.map((m) => {
    const person = eligibleById.get(m.user.id)
    return {
      id: m.user.id,
      name: m.user.name,
      avatarUrl: m.user.avatarUrl ?? null,
      role: m.user.role,
      departmentName: person?.departmentName ?? null,
      subDepartmentName: person?.subDepartmentName ?? null,
    }
  })

  const availableUsers = eligible.filter((p) => !memberIds.has(p.id))

  return NextResponse.json({ projectId: project.id, members, availableUsers })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const body = await req.json()
  const userIds: string[] = Array.isArray(body.userIds) ? body.userIds : []
  if (userIds.length === 0) {
    return NextResponse.json({ error: "No userIds provided" }, { status: 400 })
  }

  const project = await prisma.project.findFirst({
    where: { OR: [{ slug: id }, { id }] },
    select: { id: true, departmentId: true, subDepartment: { select: { departmentId: true } } },
  })
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const projectDeptId = project.departmentId ?? project.subDepartment?.departmentId ?? null

  if (profile.role !== "admin" && profile.role !== "manager") {
    if (projectDeptId) {
      const callerInDept = profile.memberships?.some(
        (m: { subDepartment: { department?: { id: string } | null } }) =>
          m.subDepartment.department?.id === projectDeptId,
      )
      if (!callerInDept) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }
  }

  const eligibility = await assertUsersEligibleForProjectDepartment(
    projectDeptId,
    userIds,
  )
  if (!eligibility.ok) {
    return NextResponse.json(
      { error: "One or more users are outside this project's department" },
      { status: 400 },
    )
  }

  await prisma.projectMember.createMany({
    data: userIds.map((userId) => ({ projectId: project.id, userId })),
    skipDuplicates: true,
  })

  return NextResponse.json({ ok: true })
}
