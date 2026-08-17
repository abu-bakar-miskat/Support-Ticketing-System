import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getProfileDeptScope } from "@/lib/dept-scope";

export async function GET() {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const deptScope = await getProfileDeptScope(profile);
  const departmentId = deptScope?.activeDeptId ?? null;

  const templates = await prisma.ticketTemplate.findMany({
    where: { departmentId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      customFields: true,
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      createdAt: true,
    },
  });

  return NextResponse.json(templates);
}

export async function POST(request: NextRequest) {
  const { profile, error } = await requireAuth();
  if (error) return error;
  if (profile.role !== "admin" && profile.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deptScope = await getProfileDeptScope(profile);
  const departmentId = deptScope?.activeDeptId ?? null;

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const customFields = Array.isArray(body.customFields) ? body.customFields : [];

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const template = await prisma.ticketTemplate.create({
    data: {
      name,
      departmentId,
      customFields,
      createdById: profile.id,
    },
    select: {
      id: true,
      name: true,
      customFields: true,
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      createdAt: true,
    },
  });

  return NextResponse.json(template, { status: 201 });
}
