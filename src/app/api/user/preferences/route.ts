import { NextResponse } from "next/server";
import { getProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import { isFontSize } from "@/lib/font-size";
import { parsePinnedProjectIds } from "@/lib/pinned-projects-prefs";
import type { Prisma } from "@/generated/prisma/client";

type UserPreferences = {
  pinnedProjectIds?: string[];
  projectTabPrefs?: Record<string, string>;
  fontSize?: string;
};

function readPrefsObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return { ...(raw as Record<string, unknown>) };
}

function parsePrefs(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const p = raw as Record<string, unknown>;
  return {
    pinnedProjectIds: parsePinnedProjectIds(raw),
    projectTabPrefs:
      p.projectTabPrefs &&
      typeof p.projectTabPrefs === "object" &&
      !Array.isArray(p.projectTabPrefs)
        ? (p.projectTabPrefs as Record<string, string>)
        : {},
    fontSize: isFontSize(p.fontSize) ? p.fontSize : undefined,
  };
}

export async function GET() {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await prisma.profile.findUnique({
    where: { id: profile.id },
    select: { preferences: true },
  });

  return NextResponse.json(parsePrefs(row?.preferences));
}

export async function PATCH(req: Request) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  const row = await prisma.profile.findUnique({
    where: { id: profile.id },
    select: { preferences: true },
  });

  // Merge into the full preferences blob so signature, displayName, etc. are preserved.
  const next = readPrefsObject(row?.preferences);

  if ("pinnedProjectIds" in body && Array.isArray(body.pinnedProjectIds)) {
    next.pinnedProjectIds = parsePinnedProjectIds({
      pinnedProjectIds: body.pinnedProjectIds,
    });
  }

  if (body.projectTabPref && typeof body.projectTabPref === "object") {
    const { projectId, tab } = body.projectTabPref as { projectId: string; tab: string };
    if (projectId && tab) {
      const tabs =
        next.projectTabPrefs &&
        typeof next.projectTabPrefs === "object" &&
        !Array.isArray(next.projectTabPrefs)
          ? (next.projectTabPrefs as Record<string, string>)
          : {};
      next.projectTabPrefs = { ...tabs, [projectId]: tab };
    }
  }

  if ("fontSize" in body && isFontSize(body.fontSize)) {
    next.fontSize = body.fontSize;
  }

  await prisma.profile.update({
    where: { id: profile.id },
    data: { preferences: next as Prisma.InputJsonValue },
  });

  return NextResponse.json(parsePrefs(next));
}
