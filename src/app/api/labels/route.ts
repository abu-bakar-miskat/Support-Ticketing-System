import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { runAsSystem } from "@/lib/request-scope";

export async function GET() {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const deptScope = await getProfileDeptScope(profile);
  const departmentId = deptScope?.activeDeptId ?? null;

  // Registry only. Scanning every ticket just to count label usage filled the
  // pooler on board/task pages. The picker treats missing counts as unused.
  const labels = await runAsSystem(() =>
    prisma.label.findMany({
      where: { departmentId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
  );

  return NextResponse.json({
    labels,
    counts: {},
  });
}

export async function POST(request: NextRequest) {
  const { profile, error } = await requireAuth();
  if (error) return error;
  if (profile.role !== "admin" && profile.role !== "manager" && profile.role !== "sub_manager") {
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
