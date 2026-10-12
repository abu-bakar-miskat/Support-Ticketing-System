import { inferStatusCategory, type StatusCategory } from "@/lib/status-category";
/**
 * Custom board statuses are owned by a sub-department. Their saved lifecycle
 * category drives behaviour; their label remains the ticket's display status.
 * The seeder accepts a transaction so board creation stays atomic.
 */

export type StatusType = "OPEN" | "PAUSED" | "ESCALATED" | "RESOLVED";

/**
 * Default statuses seeded for a newly-created sub-department
 * (OPEN/IN PROGRESS/PAUSED/ESCALATED/RESOLVED) until it's given its own.
 * `isComplete` is true only for the RESOLVED (done) status.
 */
export const DEFAULT_SUB_DEPARTMENT_STATUSES: readonly {
  label: string;
  category: StatusCategory;
  color: string;
  order: number;
  isComplete: boolean;
}[] = [
  { label: "OPEN", category: "TODO", color: "#94a3b8", order: 0, isComplete: false },
  { label: "IN PROGRESS", category: "IN_PROGRESS", color: "#0a76b9", order: 1, isComplete: false },
  { label: "PAUSED", category: "BLOCKED", color: "#f59e0b", order: 2, isComplete: false },
  { label: "ESCALATED", category: "BLOCKED", color: "#dc2626", order: 3, isComplete: false },
  { label: "RESOLVED", category: "COMPLETE", color: "#16a34a", order: 4, isComplete: true },
];

export const STATUS_TYPES: readonly StatusType[] = ["OPEN", "PAUSED", "ESCALATED", "RESOLVED"];

export function isStatusType(v: unknown): v is StatusType {
  return typeof v === "string" && (STATUS_TYPES as readonly string[]).includes(v);
}

/** A ticket is closed/done iff its status is RESOLVED (key on type, never label). */
export function isResolvedType(t: StatusType): boolean {
  return t === "RESOLVED";
}

// ── Transaction-scoped seeding ────────────────────────────────────────────────
// Accepts the tx/prisma client as an argument (no module-level prisma import) so
// it composes inside `$transaction` and stays test-friendly.

/* eslint-disable @typescript-eslint/no-explicit-any -- structural adapters that
   must accept the real Prisma client, an interactive tx client, and test mocks
   interchangeably. */
type SeedStatusTx = {
  subDepartmentStatus: {
    findFirst: (args: any) => Promise<any>;
    createMany: (args: any) => Promise<any>;
  };
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Idempotently create a sub-department's five default statuses
 * (OPEN/IN PROGRESS/PAUSED/ESCALATED/RESOLVED). No-ops if the sub-department
 * already has any status, so it's safe to call on every sub-department creation
 * and from a backfill.
 */
export async function seedSubDepartmentStatuses(
  tx: SeedStatusTx,
  subDepartmentId: string,
  statuses: readonly { category?: StatusCategory; label: string; color: string; order: number; isComplete: boolean }[] = DEFAULT_SUB_DEPARTMENT_STATUSES,
): Promise<void> {
  const existing = await tx.subDepartmentStatus.findFirst({
    where: { subDepartmentId },
    select: { id: true },
  });
  if (existing) return;
  await tx.subDepartmentStatus.createMany({
    data: statuses.map((s) => ({
      subDepartmentId,
      label: s.label,
      color: s.color,
      order: s.order,
      category: s.category ?? inferStatusCategory(s),
      isComplete: (s.category ?? inferStatusCategory(s)) === "COMPLETE",
    })),
  });
}
