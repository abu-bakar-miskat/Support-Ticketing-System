/**
 * Department board columns (SRS slice 04, C-03 / DAT-02 / DAT-03).
 *
 * The board is the ordered set of `BoardColumn`s owned by a department. Every
 * column carries an immutable `statusType`; ALL board logic keys on that type,
 * never the display label (C-03). This module holds the pure, isomorphic pieces
 * (defaults, type helpers, legacy-status mapping) plus a transaction-scoped
 * seeder — it deliberately does NOT import `prisma`, so it stays unit-testable
 * and usable inside any `$transaction` callback.
 */

export type StatusType = "OPEN" | "PAUSED" | "ESCALATED" | "RESOLVED";

export type DefaultColumnSpec = {
  label: string;
  color: string;
  statusType: StatusType;
  order: number;
};

/**
 * The five status-typed columns seeded on every new department board (DAT-03).
 * Two OPEN columns (OPEN / IN PROGRESS) give a normal active-work flow; the
 * remaining three cover the other status types one-to-one. New sub-departments
 * inherit this same set (see DEFAULT_SUB_DEPARTMENT_STATUSES).
 */
export const DEFAULT_BOARD_COLUMNS: readonly DefaultColumnSpec[] = [
  { label: "OPEN", color: "#94a3b8", statusType: "OPEN", order: 0 },
  { label: "IN PROGRESS", color: "#0a76b9", statusType: "OPEN", order: 1 },
  { label: "PAUSED", color: "#f59e0b", statusType: "PAUSED", order: 2 },
  { label: "ESCALATED", color: "#dc2626", statusType: "ESCALATED", order: 3 },
  { label: "RESOLVED", color: "#16a34a", statusType: "RESOLVED", order: 4 },
];

/**
 * Default statuses seeded for a newly-created sub-department so it mirrors the
 * department's default board (OPEN/IN PROGRESS/PAUSED/ESCALATED/RESOLVED) until
 * it's given its own. Kept in sync with DEFAULT_BOARD_COLUMNS. `isComplete` is
 * true only for the RESOLVED (done) status.
 */
export const DEFAULT_SUB_DEPARTMENT_STATUSES: readonly {
  label: string;
  color: string;
  order: number;
  isComplete: boolean;
}[] = [
  { label: "OPEN", color: "#94a3b8", order: 0, isComplete: false },
  { label: "IN PROGRESS", color: "#0a76b9", order: 1, isComplete: false },
  { label: "PAUSED", color: "#f59e0b", order: 2, isComplete: false },
  { label: "ESCALATED", color: "#dc2626", order: 3, isComplete: false },
  { label: "RESOLVED", color: "#16a34a", order: 4, isComplete: true },
];

export const STATUS_TYPES: readonly StatusType[] = ["OPEN", "PAUSED", "ESCALATED", "RESOLVED"];

export function isStatusType(v: unknown): v is StatusType {
  return typeof v === "string" && (STATUS_TYPES as readonly string[]).includes(v);
}

/** A ticket is closed/done iff its column is RESOLVED (key on type, never label). */
export function isResolvedType(t: StatusType): boolean {
  return t === "RESOLVED";
}

type ColumnLike = { statusType: StatusType; order: number };

/**
 * First column of a given status type in board order — e.g. the first OPEN
 * column a reopened ticket lands in (BD-09), or the ESCALATED target (slice 07).
 * Returns null when the board has no column of that type.
 */
export function firstColumnOfType<T extends ColumnLike>(columns: T[], type: StatusType): T | null {
  let best: T | null = null;
  for (const c of columns) {
    if (c.statusType === type && (best === null || c.order < best.order)) best = c;
  }
  return best;
}

// ── Legacy status → default column (slice-04 migration: collapse-to-5) ─────────
// Maps a per-team TeamStatus (label + isComplete) onto one of the five default
// column labels. Keys on the isComplete flag and well-known label aliases only —
// never fuzzy matching. Anything unrecognized and open falls to "In Progress".
//
// Design note: "Blocked" maps to On Hold (PAUSED), not Escalated. ESCALATED is
// reserved for explicit user escalation (BD-08 / slice 07); auto-escalating every
// historically-blocked ticket during the backfill would misrepresent its state.

const RESOLVED_ALIASES = new Set([
  "live", "done", "closed", "resolved", "complete", "completed", "shipped", "merged",
]);
const ESCALATED_ALIASES = new Set(["escalated", "escalation"]);
const PAUSED_ALIASES = new Set([
  "on hold", "on-hold", "hold", "paused", "blocked", "waiting",
  "waiting for customer", "waiting for support", "stalled",
]);
const TODO_ALIASES = new Set([
  "to do", "todo", "not started", "backlog", "open", "new", "triage", "icebox",
]);

/** The default column label a legacy status collapses onto. Pure + total. */
export function defaultColumnLabelForStatus(label: string | null | undefined, isComplete: boolean): string {
  const norm = (label ?? "").trim().toLowerCase();
  if (isComplete || RESOLVED_ALIASES.has(norm)) return "Done";
  if (ESCALATED_ALIASES.has(norm)) return "Escalated";
  if (PAUSED_ALIASES.has(norm)) return "On Hold";
  if (TODO_ALIASES.has(norm)) return "To Do";
  return "In Progress";
}

// ── Transaction-scoped seeding ────────────────────────────────────────────────
// Accepts the tx/prisma client as an argument (no module-level prisma import) so
// it composes inside `$transaction` and stays test-friendly.

/* eslint-disable @typescript-eslint/no-explicit-any -- structural adapters that
   must accept the real Prisma client, an interactive tx client, and test mocks
   interchangeably; results are re-typed at the call site below. */
type SeedTx = {
  boardColumn: {
    findFirst: (args: any) => Promise<any>;
    createMany: (args: any) => Promise<any>;
  };
};

type ResolveTx = {
  boardColumn: {
    findMany: (args: any) => Promise<any>;
  };
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * The board-column id a ticket with the given status should sit in, within its
 * department's board (DAT-03). Prefers an exact label match (so renamed/custom
 * columns win), else collapses the legacy status onto a default column label.
 * Returns null when the department has no board yet (pre-backfill) so the caller
 * can leave `boardColumnId` unset rather than fail.
 */
export async function resolveColumnIdForStatus(
  tx: ResolveTx,
  params: { departmentId: string; status: string | null | undefined; isComplete?: boolean },
): Promise<string | null> {
  const cols = (await tx.boardColumn.findMany({
    where: { departmentId: params.departmentId },
    select: { id: true, label: true },
  })) as { id: string; label: string }[];
  if (cols.length === 0) return null;
  const exact = params.status ? cols.find((c) => c.label === params.status) : undefined;
  if (exact) return exact.id;
  const targetLabel = defaultColumnLabelForStatus(params.status, params.isComplete ?? false);
  return cols.find((c) => c.label === targetLabel)?.id ?? null;
}

/**
 * Idempotently create a department's five default columns. No-ops if the board
 * already has any column, so it's safe to call on every department creation and
 * from the backfill. Caller supplies the owning tenantId (denormalized onto each
 * column for the non-bypassable scope extension).
 */
export async function seedDepartmentBoard(
  tx: SeedTx,
  params: { departmentId: string; tenantId: string },
): Promise<void> {
  const existing = await tx.boardColumn.findFirst({
    where: { departmentId: params.departmentId },
    select: { id: true },
  });
  if (existing) return;
  await tx.boardColumn.createMany({
    data: DEFAULT_BOARD_COLUMNS.map((c) => ({
      tenantId: params.tenantId,
      departmentId: params.departmentId,
      label: c.label,
      color: c.color,
      statusType: c.statusType,
      order: c.order,
    })),
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type SeedStatusTx = {
  subDepartmentStatus: {
    findFirst: (args: any) => Promise<any>;
    createMany: (args: any) => Promise<any>;
  };
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Idempotently create a sub-department's five default statuses
 * (OPEN/IN PROGRESS/PAUSED/ESCALATED/RESOLVED), mirroring the department board.
 * No-ops if the sub-department already has any status, so it's safe to call on
 * every sub-department creation and from a backfill.
 */
export async function seedSubDepartmentStatuses(
  tx: SeedStatusTx,
  subDepartmentId: string,
): Promise<void> {
  const existing = await tx.subDepartmentStatus.findFirst({
    where: { subDepartmentId },
    select: { id: true },
  });
  if (existing) return;
  await tx.subDepartmentStatus.createMany({
    data: DEFAULT_SUB_DEPARTMENT_STATUSES.map((s) => ({
      subDepartmentId,
      label: s.label,
      color: s.color,
      order: s.order,
      isComplete: s.isComplete,
    })),
  });
}
