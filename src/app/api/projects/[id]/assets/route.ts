import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { ProjectAsset } from "@/lib/api/projects";
import {
  assetsUpdateAllowedForStaff,
  canAddProjectAssets,
  canDeleteProjectAssets,
} from "@/lib/project-assets";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  if (!(await canAddProjectAssets(profile, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await prisma.project.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    select: { id: true, assets: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.assets)) {
    return NextResponse.json({ error: "assets array required" }, { status: 400 });
  }

  const nextAssets = body.assets as ProjectAsset[];
  const previousAssets = Array.isArray(project.assets)
    ? (project.assets as ProjectAsset[])
    : [];

  const privileged = canDeleteProjectAssets(profile);
  if (!privileged && !assetsUpdateAllowedForStaff(previousAssets, nextAssets)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.project.update({
    where: { id: project.id },
    data: { assets: nextAssets },
    select: { id: true, assets: true },
  });

  return NextResponse.json(updated);
}
