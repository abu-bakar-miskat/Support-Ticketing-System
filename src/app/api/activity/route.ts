import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { timeAgo } from "@/lib/format";
import { avatarColorFor } from "@/lib/avatar";
import { buildActivityLogWhere } from "@/lib/activity-access";

export async function GET(req: NextRequest) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") ?? undefined;
  const action = searchParams.get("action") ?? undefined;
  const cursor = searchParams.get("cursor") ?? undefined;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const actorId = searchParams.get("actorId") ?? undefined;
  const take = 50;

  const deptScope = await getProfileDeptScope(profile);
  const subDepartmentIds = deptScope?.subDepartmentIds ?? [];

  function parseDate(s: string, endOfDay = false): Date {
    if (s.includes("T")) return new Date(s);
    return new Date(s + (endOfDay ? "T23:59:59.999" : "T00:00:00.000"));
  }

  const where = buildActivityLogWhere(profile, subDepartmentIds, {
    ...(from ? { from: parseDate(from, false) } : {}),
    ...(to ? { to: parseDate(to, true) } : {}),
    projectId,
    action,
    actorId,
  });

  const rows = await prisma.activityLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      actor: { select: { id: true, name: true, avatarUrl: true, role: true } },
      ticket: {
        select: {
          id: true,
          title: true,
          ticketNumber: true,
          status: true,
          priority: true,
          subDepartment: { select: { id: true, name: true, prefix: true } },
          project: { select: { id: true, name: true, color: true } },
        },
      },
    },
  });

  const hasMore = rows.length > take;
  const items = rows.slice(0, take);
  const now = new Date();

  const data = items.map((row) => ({
    id: row.id,
    action: row.action,
    metadata: row.metadata as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    time: timeAgo(row.createdAt, now),
    actor: {
      id: row.actor.id,
      name: row.actor.name,
      avatarUrl: row.actor.avatarUrl ?? null,
      color: avatarColorFor(row.actor.name),
      role: row.actor.role,
    },
    ticket: {
      id: row.ticket.id,
      humanId: `${row.ticket.subDepartment.prefix}-${row.ticket.ticketNumber}`,
      title: row.ticket.title,
      status: row.ticket.status,
      priority: row.ticket.priority,
      subDepartmentId: row.ticket.subDepartment.id,
      subDepartmentName: row.ticket.subDepartment.name,
      projectId: row.ticket.project?.id ?? null,
      projectName: row.ticket.project?.name ?? null,
      projectColor: row.ticket.project?.color ?? null,
    },
  }));

  return NextResponse.json({
    items: data,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  });
}
