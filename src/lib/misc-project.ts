import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

export function miscProjectSlug(subDepartmentId: string) {
  return `miscellaneous-${subDepartmentId}`;
}

/**
 * Returns the single Miscellaneous project for a team.
 * Slug `miscellaneous-{teamId}` is the canonical key — one project per team.
 */
export async function resolveMiscProjectForSubDepartment(
  subDepartmentId: string,
  db: Db = prisma,
): Promise<string> {
  const subDepartment = await db.subDepartment.findUnique({
    where: { id: subDepartmentId },
    select: { departmentId: true, tenantId: true },
  });
  if (!subDepartment) {
    throw new Error("Team not found");
  }

  const slug = miscProjectSlug(subDepartmentId);

  const project = await db.project.upsert({
    where: { slug },
    update: {
      name: "Miscellaneous",
      subDepartmentId,
      departmentId: subDepartment.departmentId,
    },
    create: {
      name: "Miscellaneous",
      slug,
      color: "#94a3b8",
      subDepartmentId,
      departmentId: subDepartment.departmentId,
      tenantId: subDepartment.tenantId,
    },
    select: { id: true },
  });

  // Merge tickets from legacy duplicate Miscellaneous rows for this team.
  const legacy = await db.project.findMany({
    where: { name: "Miscellaneous", subDepartmentId, id: { not: project.id } },
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
  subDepartmentId: string | null;
};

/** Keep one Miscellaneous row per team when listing projects. */
export function dedupeMiscProjects<T extends MiscProjectRow>(projects: T[]): T[] {
  const miscBySubDepartment = new Map<string, T>();
  const rest: T[] = [];

  for (const project of projects) {
    if (project.name !== "Miscellaneous" || !project.subDepartmentId) {
      rest.push(project);
      continue;
    }

    const canonicalSlug = miscProjectSlug(project.subDepartmentId);
    const existing = miscBySubDepartment.get(project.subDepartmentId);
    if (!existing) {
      miscBySubDepartment.set(project.subDepartmentId, project);
      continue;
    }

    const projectIsCanonical = project.slug === canonicalSlug;
    const existingIsCanonical = existing.slug === canonicalSlug;
    if (projectIsCanonical && !existingIsCanonical) {
      miscBySubDepartment.set(project.subDepartmentId, project);
    }
  }

  return [...rest, ...miscBySubDepartment.values()];
}
