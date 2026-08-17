import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

export function miscProjectSlug(teamId: string) {
  return `miscellaneous-${teamId}`;
}

/**
 * Returns the single Miscellaneous project for a team.
 * Slug `miscellaneous-{teamId}` is the canonical key — one project per team.
 */
export async function resolveMiscProjectForTeam(
  teamId: string,
  db: Db = prisma,
): Promise<string> {
  const team = await db.team.findUnique({
    where: { id: teamId },
    select: { departmentId: true, tenantId: true },
  });
  if (!team) {
    throw new Error("Team not found");
  }

  const slug = miscProjectSlug(teamId);

  const project = await db.project.upsert({
    where: { slug },
    update: {
      name: "Miscellaneous",
      teamId,
      departmentId: team.departmentId,
    },
    create: {
      name: "Miscellaneous",
      slug,
      color: "#94a3b8",
      teamId,
      departmentId: team.departmentId,
      tenantId: team.tenantId,
    },
    select: { id: true },
  });

  // Merge tickets from legacy duplicate Miscellaneous rows for this team.
  const legacy = await db.project.findMany({
    where: { name: "Miscellaneous", teamId, id: { not: project.id } },
    select: { id: true },
  });
  if (legacy.length > 0) {
    await db.ticket.updateMany({
      where: { projectId: { in: legacy.map((row) => row.id) } },
      data: { projectId: project.id },
    });
  }

  return project.id;
}

type MiscProjectRow = {
  id: string;
  name: string;
  slug: string;
  teamId: string | null;
};

/** Keep one Miscellaneous row per team when listing projects. */
export function dedupeMiscProjects<T extends MiscProjectRow>(projects: T[]): T[] {
  const miscByTeam = new Map<string, T>();
  const rest: T[] = [];

  for (const project of projects) {
    if (project.name !== "Miscellaneous" || !project.teamId) {
      rest.push(project);
      continue;
    }

    const canonicalSlug = miscProjectSlug(project.teamId);
    const existing = miscByTeam.get(project.teamId);
    if (!existing) {
      miscByTeam.set(project.teamId, project);
      continue;
    }

    const projectIsCanonical = project.slug === canonicalSlug;
    const existingIsCanonical = existing.slug === canonicalSlug;
    if (projectIsCanonical && !existingIsCanonical) {
      miscByTeam.set(project.teamId, project);
    }
  }

  return [...rest, ...miscByTeam.values()];
}
