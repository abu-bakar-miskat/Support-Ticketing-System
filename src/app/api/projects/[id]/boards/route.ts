import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { projectInScope } from "@/lib/dept-scope";
import { canManageProjectBoards } from "@/lib/project-permissions";
import { broadcastProjectBoardsChange } from "@/lib/project-boards-broadcast";
import {
  memberSubDepartmentIdsFromProject,
  parseEnabledBoardSubDepartmentIds,
  resolveEnabledBoardSubDepartmentIds,
} from "@/lib/project-boards";

async function loadProjectBoardContext(projectId: string) {
  const project = await prisma.project.findFirst({
    where: { OR: [{ id: projectId }, { slug: projectId }] },
    include: {
      subDepartment: { select: { departmentId: true } },
      members: {
        include: {
          user: {
            select: {
              name: true,
              subDepartmentId: true,
              memberships: {
                where: { isActive: true },
                select: { subDepartment: { select: { id: true } } },
                take: 1,
              },
            },
          },
        },
      },
    },
  });
  if (!project) return null;

  const projectDeptId = project.departmentId ?? project.subDepartment?.departmentId ?? null;

  const [ticketSubDepartments, departmentSubDepartments] = await Promise.all([
    prisma.ticket.findMany({
      where: { projectId: project.id, deletedAt: null, parentId: null },
      select: { subDepartmentId: true },
      distinct: ["subDepartmentId"],
    }),
    projectDeptId
      ? prisma.subDepartment.findMany({
          where: { departmentId: projectDeptId },
          select: { id: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const ticketSubDepartmentIds = ticketSubDepartments.map((t) => t.subDepartmentId);
  const departmentSubDepartmentIds = departmentSubDepartments.map((t) => t.id);
  const memberSubDepartmentIds = memberSubDepartmentIdsFromProject(project.members);
  const addableSubDepartmentIds = [...new Set([...departmentSubDepartmentIds, ...memberSubDepartmentIds])];
  const stored = parseEnabledBoardSubDepartmentIds(project.enabledBoardSubDepartmentIds);
  const enabled = resolveEnabledBoardSubDepartmentIds({
    stored,
    departmentSubDepartmentIds,
    ticketSubDepartmentIds,
    projectSubDepartmentId: project.subDepartmentId,
  });

  return { project, departmentSubDepartmentIds, memberSubDepartmentIds, addableSubDepartmentIds, ticketSubDepartmentIds, stored, enabled };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  if (!canManageProjectBoards(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const action = body.action as string | undefined;
  const subDepartmentId = (body.subDepartmentId as string | undefined)?.trim();

  if (!action || !subDepartmentId) {
    return NextResponse.json({ error: "action and teamId are required" }, { status: 400 });
  }

  const ctx = await loadProjectBoardContext(id);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!(await projectInScope(profile, ctx.project.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { project, addableSubDepartmentIds, enabled } = ctx;

  if (action === "add") {
    if (!addableSubDepartmentIds.includes(subDepartmentId)) {
      return NextResponse.json(
        { error: "Team is not available for this project" },
        { status: 400 },
      );
    }
    if (enabled.includes(subDepartmentId)) {
      return NextResponse.json({ enabledBoardSubDepartmentIds: enabled });
    }

    const next = [...enabled, subDepartmentId].sort();
    await prisma.project.update({
      where: { id: project.id },
      data: { enabledBoardSubDepartmentIds: next },
    });
    await broadcastProjectBoardsChange(project.id);
    return NextResponse.json({ enabledBoardSubDepartmentIds: next });
  }

  if (action === "remove") {
    const ticketCount = await prisma.ticket.count({
      where: { projectId: project.id, subDepartmentId, deletedAt: null },
    });
    if (ticketCount > 0) {
      return NextResponse.json(
        { error: "Cannot remove a board that still has tickets" },
        { status: 409 },
      );
    }

    const next = enabled.filter((tid) => tid !== subDepartmentId);
    await prisma.project.update({
      where: { id: project.id },
      data: { enabledBoardSubDepartmentIds: next },
    });
    await broadcastProjectBoardsChange(project.id);
    return NextResponse.json({ enabledBoardSubDepartmentIds: next });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
