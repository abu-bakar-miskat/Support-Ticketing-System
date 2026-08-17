import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Ensure the given users are ProjectMembers of `projectId`.
 * No-op when projectId is missing or userIds is empty.
 * Idempotent via skipDuplicates — safe to call on every assignment.
 */
export async function ensureProjectMembers(
  projectId: string | null | undefined,
  userIds: Array<string | null | undefined>,
  db: Db = prisma,
): Promise<void> {
  if (!projectId) return;

  const unique = [
    ...new Set(
      userIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ),
    ),
  ];
  if (unique.length === 0) return;

  await db.projectMember.createMany({
    data: unique.map((userId) => ({ projectId, userId })),
    skipDuplicates: true,
  });
}
