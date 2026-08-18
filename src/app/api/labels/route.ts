import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getProfileDeptScope } from "@/lib/dept-scope";

export async function GET() {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const deptScope = await getProfileDeptScope(profile);
  const departmentId = deptScope?.activeDeptId ?? null;

  const labels = await prisma.label.findMany({
    where: { departmentId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true },
  });

  // Also include labels used in tickets that aren't in the registry yet
  const tickets = await prisma.ticket.findMany({
    where: {
      deletedAt: null,
      ...(deptScope ? { subDepartmentId: { in: deptScope.subDepartmentIds } } : {}),
    },
    select: { labels: true },
  });

  const ticketLabelCounts = new Map<string, number>();
  for (const t of tickets) {
    for (const l of t.labels) {
      ticketLabelCounts.set(l, (ticketLabelCounts.get(l) ?? 0) + 1);
    }
  }

  return NextResponse.json({
    labels,
    counts: Object.fromEntries(ticketLabelCounts),
  });
}

export async function POST(request: NextRequest) {
  const { profile, error } = await requireAuth();
  if (error) return error;
  if (profile.role !== "admin" && profile.role !== "manager" && profile.role !== "lead") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deptScope = await getProfileDeptScope(profile);
  const departmentId = deptScope?.activeDeptId ?? null;

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const color = typeof body.color === "string" ? body.color.trim() : "#94a3b8";

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const existing = departmentId
    ? await prisma.label.findUnique({
        where: { name_departmentId: { name, departmentId } },
      })
    : await prisma.label.findFirst({ where: { name, departmentId: null } });
  if (existing) return NextResponse.json({ error: "Label already exists" }, { status: 409 });

  const label = await prisma.label.create({
    data: { name, color, departmentId },
    select: { id: true, name: true, color: true },
  });

  return NextResponse.json(label, { status: 201 });
}
