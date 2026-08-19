import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth();
  if (error) return error;
  if (profile.role !== "admin" && profile.role !== "manager" && profile.role !== "sub_manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const label = await prisma.label.findUnique({ where: { id } });
  if (!label) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const newName = typeof body.name === "string" ? body.name.trim() : null;
  const newColor = typeof body.color === "string" ? body.color.trim() : null;

  const updateData: { name?: string; color?: string } = {};
  if (newName && newName !== label.name) updateData.name = newName;
  if (newColor) updateData.color = newColor;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(label);
  }

  // If renaming, update all tickets that use the old name
  if (updateData.name) {
    const tickets = await prisma.ticket.findMany({
      where: { labels: { has: label.name } },
      select: { id: true, labels: true },
    });
    await Promise.all(
      tickets.map((t) =>
        prisma.ticket.update({
          where: { id: t.id },
          data: { labels: t.labels.map((l) => (l === label.name ? updateData.name! : l)) },
        }),
      ),
    );
  }

  const updated = await prisma.label.update({
    where: { id },
    data: updateData,
    select: { id: true, name: true, color: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth();
  if (error) return error;
  if (profile.role !== "admin" && profile.role !== "manager" && profile.role !== "sub_manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const label = await prisma.label.findUnique({ where: { id } });
  if (!label) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Remove from all tickets first
  const tickets = await prisma.ticket.findMany({
    where: { labels: { has: label.name } },
    select: { id: true, labels: true },
  });
  await Promise.all(
    tickets.map((t) =>
      prisma.ticket.update({
        where: { id: t.id },
        data: { labels: t.labels.filter((l) => l !== label.name) },
      }),
    ),
  );

  await prisma.label.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
