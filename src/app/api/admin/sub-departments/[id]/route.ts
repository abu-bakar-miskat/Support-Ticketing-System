import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAdminOrManager } from "@/lib/auth"
import type { AuthProfile } from "@/lib/auth"

async function assertSubDepartmentScope(subDepartmentId: string, profile: AuthProfile): Promise<NextResponse | null> {
  if (profile.role === "admin") return null
  const subDepartment = await prisma.subDepartment.findUnique({ where: { id: subDepartmentId }, select: { departmentId: true } })
  if (!subDepartment) return NextResponse.json({ error: "Team not found" }, { status: 404 })
  // Write operations are restricted to directly-managed departments only
  const directlyManages: string[] = (profile as any).managedDepartmentIds ?? []
  if (!directlyManages.includes(subDepartment.departmentId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return null
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error

  const { id } = await params
  const scopeError = await assertSubDepartmentScope(id, profile!)
  if (scopeError) return scopeError

  const body = await request.json()
  const name = (body.name as string)?.trim()
  const prefix = (body.prefix as string | undefined)?.trim().toUpperCase()
  const color = (body.color as string | undefined)?.trim()
  const departmentId = (body.departmentId as string | undefined)?.trim()

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }
  if (prefix !== undefined) {
    if (prefix.length < 2 || prefix.length > 5) {
      return NextResponse.json({ error: "Prefix must be 2–5 characters" }, { status: 400 })
    }
    if (!/^[A-Z]+$/.test(prefix)) {
      return NextResponse.json({ error: "Prefix must contain only letters" }, { status: 400 })
    }
  }

  if (departmentId && profile!.role !== "admin") {
    const directlyManages: string[] = (profile as any).managedDepartmentIds ?? []
    if (!directlyManages.includes(departmentId)) {
      return NextResponse.json({ error: "Forbidden: target department is outside your scope" }, { status: 403 })
    }
  }

  try {
    const subDepartment = await prisma.subDepartment.update({
      where: { id },
      data: {
        name,
        ...(prefix ? { prefix } : {}),
        ...(color ? { color } : {}),
        ...(departmentId ? { departmentId } : {}),
      },
      include: { department: { select: { id: true, name: true } } },
    })
    return NextResponse.json(subDepartment)
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "A team with that prefix already exists" }, { status: 409 })
    }
    throw e
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error

  const { id } = await params
  const scopeError = await assertSubDepartmentScope(id, profile!)
  if (scopeError) return scopeError

  const ticketCount = await prisma.ticket.count({ where: { subDepartmentId: id } })
  if (ticketCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete: this team has ${ticketCount} ticket${ticketCount === 1 ? "" : "s"}` },
      { status: 409 }
    )
  }

  // IntakeFormConfig.intakeTeamId is required — block rather than orphan forms.
  const intakeFormCount = await prisma.intakeFormConfig.count({
    where: { intakeSubDepartmentId: id },
  })
  if (intakeFormCount > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete: ${intakeFormCount} intake form${intakeFormCount === 1 ? "" : "s"} still use this team`,
      },
      { status: 409 }
    )
  }

  // Team create auto-attaches a Project board (and teams may have statuses,
  // counters, etc.) none of which cascade on Team delete — clear those FKs
  // first so an empty team can actually be removed.
  await prisma.$transaction([
    prisma.profile.updateMany({ where: { subDepartmentId: id }, data: { subDepartmentId: null } }),
    prisma.routingRule.updateMany({ where: { subDepartmentId: id }, data: { subDepartmentId: null } }),
    prisma.intakeIssue.updateMany({ where: { intakeSubDepartmentId: id }, data: { intakeSubDepartmentId: null } }),
    prisma.project.updateMany({ where: { subDepartmentId: id }, data: { subDepartmentId: null } }),
    prisma.subDepartmentStatus.deleteMany({ where: { subDepartmentId: id } }),
    prisma.subDepartmentTicketCounter.deleteMany({ where: { subDepartmentId: id } }),
    prisma.subDepartmentGitHubStatusMap.deleteMany({ where: { subDepartmentId: id } }),
    prisma.subDepartment.delete({ where: { id } }),
  ])

  return new NextResponse(null, { status: 204 })
}
