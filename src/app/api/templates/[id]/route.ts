import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth();
  if (error) return error;
  if (profile.role !== "admin" && profile.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const template = await prisma.ticketTemplate.findUnique({ where: { id } });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : null;
  const customFields = Array.isArray(body.customFields) ? body.customFields : null;

  const updateData: any = {};
  if (name && name !== template.name) updateData.name = name;
  if (customFields !== null) updateData.customFields = customFields;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(template);
  }

  const updated = await prisma.ticketTemplate.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      name: true,
      customFields: true,
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth();
  if (error) return error;
  if (profile.role !== "admin" && profile.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const template = await prisma.ticketTemplate.findUnique({ where: { id } });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.ticketTemplate.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
