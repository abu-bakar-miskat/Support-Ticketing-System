import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAuth } from "../_guard"
import { buildProjectDeptWhere, getProfileDeptScope } from "@/lib/dept-scope"
import { canManageProjects, canManageProjectLifecycle } from "@/lib/project-permissions"
import { assertUsersEligibleForProjectDepartment } from "@/lib/project-department-people"
import { sanitizeLifecycleStages } from "@/lib/project-lifecycle"

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "P2002"
  )
}

// Readable by all authenticated users (ticket creation form needs the list)
// Managers only see projects belonging to their managed/granted departments
export async function GET() {
  const { profile, error } = await requireAuth()
  if (error) return error

  const isAdmin = profile.role === "admin"
  const isManager = profile.role === "manager"
  const deptScope = await getProfileDeptScope(profile)

  const projects = await prisma.project.findMany({
    where: deptScope
      ? buildProjectDeptWhere(deptScope)
      : isAdmin
        ? { tenantId: profile.activeTenantId ?? "__no_tenant__" }
        : isManager
          ? {
              OR: [
                {
                  departmentId: {
                    in: [
                      ...new Set([
                        ...(profile.managedDepartmentIds ?? []),
                        ...(profile.grantedAccessDeptIds ?? []),
                      ]),
                    ],
                  },
                },
                {
                  subDepartment: {
                    departmentId: {
                      in: [
                        ...new Set([
                          ...(profile.managedDepartmentIds ?? []),
                          ...(profile.grantedAccessDeptIds ?? []),
                        ]),
                      ],
                    },
                  },
                },
              ],
            }
          : {},
    orderBy: { name: "asc" },
    include: { _count: { select: { tickets: true } } },
  })
  return NextResponse.json(projects)
}

export async function POST(request: Request) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const isAdmin = profile.role === "admin"
  const isManager = profile.role === "manager"

  if (!canManageProjects(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const name = (body.name as string)?.trim()
  const color = (body.color as string | undefined)?.trim() || "#0a76b9"
  const description = (body.description as string | undefined)?.trim() || null
  const canSetLifecycle = canManageProjectLifecycle(profile)
  const projectStatus = canSetLifecycle
    ? (body.projectStatus as string | undefined)?.trim() || "pipeline"
    : "pipeline"
  const lifecycleStages = canSetLifecycle
    ? sanitizeLifecycleStages(body.lifecycleStages)
    : null
  const departmentId = (body.departmentId as string | undefined)?.trim() || null
  const memberIds: string[] = Array.isArray(body.memberIds) ? body.memberIds : []

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 })
  }

  const slug = ((body.slug as string | undefined)?.trim() || slugify(name)).toLowerCase()

  if (!slug) {
    return NextResponse.json({ error: "Could not generate a valid slug from the name" }, { status: 400 })
  }

  const deptScope = await getProfileDeptScope(profile)
  const resolvedDeptId = departmentId ?? deptScope?.activeDeptId ?? null
  if (deptScope && resolvedDeptId && resolvedDeptId !== deptScope.activeDeptId) {
    return NextResponse.json({ error: "departmentId must match active department" }, { status: 403 })
  }

  // Cross-access managers may not create projects in departments they don't directly manage
  if (isManager && resolvedDeptId) {
    const directlyManages = (profile.managedDepartmentIds ?? []).includes(resolvedDeptId)
    if (!directlyManages) {
      return NextResponse.json({ error: "Forbidden: cross-access does not allow creating projects" }, { status: 403 })
    }
  }

  try {
    if (memberIds.length > 0) {
      const eligibility = await assertUsersEligibleForProjectDepartment(
        resolvedDeptId,
        memberIds,
      )
      if (!eligibility.ok) {
        return NextResponse.json(
          { error: "One or more members are outside this project's department" },
          { status: 400 },
        )
      }
    }

    const departmentSubDepartmentIds = resolvedDeptId
      ? (
          await prisma.subDepartment.findMany({
            where: { departmentId: resolvedDeptId },
            select: { id: true },
            orderBy: { name: "asc" },
          })
        ).map((t) => t.id)
      : []

    const tenantId = profile.activeTenantId
    if (!tenantId) {
      return NextResponse.json({ error: "No active tenant" }, { status: 400 })
    }

    const project = await prisma.project.create({
      data: {
        name,
        slug,
        color,
        description,
        projectStatus,
        ...(lifecycleStages ? { lifecycleStages } : {}),
        moduleSystemEnabled: body.moduleSystemEnabled === true,
        projectUrl: (body.projectUrl as string | undefined)?.trim() || null,
        departmentId: resolvedDeptId,
        tenantId,
        enabledBoardSubDepartmentIds: departmentSubDepartmentIds.length > 0 ? departmentSubDepartmentIds : undefined,
        members: memberIds.length > 0
          ? { create: memberIds.map((userId) => ({ userId })) }
          : undefined,
      },
    })
    return NextResponse.json(project, { status: 201 })
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "A project with that slug already exists" }, { status: 409 })
    }
    console.error("[POST /api/admin/projects]", e)
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 })
  }
}
