import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

export function miscProjectSlug(subDepartmentId: string) {
  return `miscellaneous-${subDepartmentId}`;
}

/**
 * Returns the single Miscellaneous project for a subDepartment.
 * Slug `miscellaneous-{teamId}` is the canonical key — one project per subDepartment.
 */
export async function resolveMiscProjectForSubDepartment(
  subDepartmentId: string,
  db: Db = prisma,
): Promise<string> {
  const slug = miscProjectSlug(subDepartmentId);
  const existing = await db.project.findUnique({ where: { slug }, select: { id: true } });
  if (existing) return existing.id;

  const subDepartment = await db.subDepartment.findUnique({
    where: { id: subDepartmentId },
    select: { departmentId: true, tenantId: true },
  });
  if (!subDepartment) {
    throw new Error("SubDepartment not found");
  }

  const project = await db.project.upsert({
    where: { slug },
    update: {},
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

  return project.id;
}

/** Explicit maintenance operation; never move legacy tickets during creation. */
export async function reconcileMiscProjectTickets(subDepartmentId: string, db: Db = prisma): Promise<void> {
  const projectId = await resolveMiscProjectForSubDepartment(subDepartmentId, db);
  const legacy = await db.project.findMany({
    where: { name: "Miscellaneous", subDepartmentId, id: { not: projectId } },
    select: { id: true },
  });
  if (legacy.length > 0) {
    await db.ticket.updateMany({
      where: { projectId: { in: legacy.map((row) => row.id) } },
      data: { projectId },
    });
  }
}

type MiscProjectRow = {
  id: string;
  name: string;
  slug: string;
  subDepartmentId: string | null;
};

/** Keep one Miscellaneous row per subDepartment when listing projects. */
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
