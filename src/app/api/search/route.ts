import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { buildProjectDeptWhere, getProfileDeptScope } from "@/lib/dept-scope"
import { assignedProjectsInDeptWhere } from "@/lib/cross-access"

export async function GET(req: NextRequest) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const q = req.nextUrl.searchParams.get("q")?.trim()
  if (!q || q.length < 2) return NextResponse.json({ tickets: [], projects: [] })

  const deptScope = await getProfileDeptScope(profile)

  // Cross-access: user is visiting a dept granted via DepartmentAccess, not one they manage or
  // natively belong to. Full-access grants are excluded from isCrossAccessOnly, so full-access
  // users search across the whole department instead of just their own assignments.
  const isCrossAccessDept = deptScope?.isCrossAccessOnly === true

  // Parse "PREFIX-NUMBER" ticket ID queries (e.g. "ENG-123")
  const ticketNumMatch = q.match(/^([A-Za-z]+)-(\d+)$/)
  const numericQuery = !ticketNumMatch && /^\d+$/.test(q) ? parseInt(q, 10) : null
  // Reference-id queries: the ticket's cuid primary key (surfaced as "Reference
  // ID"). Only treat long, unbroken alphanumeric strings as a reference id so
  // ordinary word searches aren't affected. Prefix match handles pasted-in-full
  // or partial ids.
  const looksLikeReferenceId = /^[a-z0-9]{8,}$/i.test(q)

  const baseTicketWhere = {
    deletedAt: null,
    // Cross-access users only see tickets from projects they're explicitly assigned to
    ...(isCrossAccessDept && profile.id && deptScope
      ? {
          project: assignedProjectsInDeptWhere(
            profile.id,
            deptScope.activeDeptId,
          ),
        }
      : {}),
    // Department/team scope
    ...(deptScope
      ? { teamId: { in: deptScope.teamIds } }
      : profile.role === "admin"
        ? { tenantId: profile.activeTenantId ?? "__no_tenant__" }
        : { team: { memberships: { some: { userId: profile.id } } } }),
  }

  const [tickets, projects] = await Promise.all([
    prisma.ticket.findMany({
      where: ticketNumMatch
        ? {
            ...baseTicketWhere,
            ticketNumber: parseInt(ticketNumMatch[2], 10),
            team: { is: { prefix: { equals: ticketNumMatch[1], mode: "insensitive" } } },
          }
        : {
            ...baseTicketWhere,
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { team: { is: { prefix: { contains: q, mode: "insensitive" } } } },
              ...(numericQuery !== null ? [{ ticketNumber: numericQuery }] : []),
              ...(looksLikeReferenceId
                ? [{ id: { startsWith: q, mode: "insensitive" as const } }]
                : []),
            ],
          },
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        priority: true,
        team: { select: { prefix: true } },
        project: { select: { name: true } },
      },
      take: 8,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.project.findMany({
      where: {
        // Cross-access users only see projects they're explicitly assigned to
        ...(isCrossAccessDept && deptScope
          ? assignedProjectsInDeptWhere(profile.id, deptScope.activeDeptId)
          : deptScope
            ? buildProjectDeptWhere(deptScope)
            : profile.role === "admin"
              ? { tenantId: profile.activeTenantId ?? "__no_tenant__" }
              : { members: { some: { userId: profile.id } } }),
        name: { contains: q, mode: "insensitive" },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        color: true,
        projectStatus: true,
        _count: { select: { tickets: { where: { deletedAt: null } } } },
      },
      take: 5,
    }),
  ])

  return NextResponse.json({
    tickets: tickets.map((t) => ({
      id: t.id,
      humanId: `${t.team.prefix}-${t.ticketNumber}`,
      title: t.title,
      status: t.status,
      priority: t.priority ?? null,
      project: t.project?.name ?? null,
    })),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      color: p.color ?? "#0a76b9",
      status: p.projectStatus ?? "pipeline",
      ticketCount: p._count.tickets,
    })),
  })
}
