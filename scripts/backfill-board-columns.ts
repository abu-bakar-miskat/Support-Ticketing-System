/**
 * Slice 04 backfill — department boards + ticket → column assignment.
 *
 * Idempotent, additive-only:
 *   1. Seeds the five default columns for every department that has no board yet.
 *   2. For every ticket with a null boardColumnId, resolves its department (the
 *      project's, its team's, or the ticket's team's) and places it in that
 *      department's column matching its current status — collapse-to-5 mapping
 *      (see lib/board-columns.defaultColumnLabelForStatus). A ticket's status
 *      completeness comes from its team's TeamStatus.isComplete.
 *
 * Uses a RAW PrismaClient (no scope extension) so it spans all tenants, exactly
 * like the other one-off scripts. Safe to re-run: already-assigned tickets and
 * already-seeded boards are skipped.
 *
 * Usage:  npx tsx scripts/backfill-board-columns.ts [--dry-run]
 *
 * DO NOT run against the shared DB without sign-off (AGENTS.md). It writes to
 * real ticket rows (additive column only) and creates BoardColumn rows.
 */
import { readFileSync } from "fs";
import path from "path";
import { Pool } from "pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  seedDepartmentBoard,
  defaultColumnLabelForStatus,
} from "../src/lib/board-columns";

const DRY_RUN = process.argv.includes("--dry-run");

if (!process.env.DATABASE_URL) {
  const env = readFileSync(path.join(process.cwd(), ".env"), "utf8");
  const m = env.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?\s*$/m);
  if (!m) throw new Error("DATABASE_URL not found in .env");
  process.env.DATABASE_URL = m[1];
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log(`[backfill] board columns ${DRY_RUN ? "(DRY RUN)" : ""}`);

  // ── 1. Seed boards for every department ─────────────────────────────────────
  const depts = await prisma.department.findMany({ select: { id: true, tenantId: true } });
  let seeded = 0;
  for (const d of depts) {
    const before = await prisma.boardColumn.count({ where: { departmentId: d.id } });
    if (before > 0) continue;
    if (!DRY_RUN) await seedDepartmentBoard(prisma, { departmentId: d.id, tenantId: d.tenantId });
    seeded++;
  }
  console.log(`[backfill] departments: ${depts.length}, boards seeded: ${seeded}`);

  // ── 2. Preload column maps + per-team status completeness ───────────────────
  const columns = await prisma.boardColumn.findMany({
    select: { id: true, label: true, departmentId: true },
  });
  // departmentId -> (label -> columnId)
  const colByDeptLabel = new Map<string, Map<string, string>>();
  for (const c of columns) {
    let m = colByDeptLabel.get(c.departmentId);
    if (!m) colByDeptLabel.set(c.departmentId, (m = new Map()));
    m.set(c.label, c.id);
  }

  const statuses = await prisma.teamStatus.findMany({
    select: { teamId: true, label: true, isComplete: true },
  });
  const completeByTeamLabel = new Map<string, boolean>();
  for (const s of statuses) completeByTeamLabel.set(`${s.teamId}|${s.label}`, s.isComplete);

  // ── 3. Backfill tickets missing a column ────────────────────────────────────
  const tickets = await prisma.ticket.findMany({
    where: { boardColumnId: null },
    select: {
      id: true,
      status: true,
      teamId: true,
      team: { select: { departmentId: true } },
      project: {
        select: { departmentId: true, team: { select: { departmentId: true } } },
      },
    },
  });

  // Group by target column so we can updateMany per column.
  const idsByColumn = new Map<string, string[]>();
  let unresolvedDept = 0;
  let unresolvedColumn = 0;

  for (const t of tickets) {
    const deptId =
      t.project?.departmentId ??
      t.project?.team?.departmentId ??
      t.team?.departmentId ??
      null;
    if (!deptId) {
      unresolvedDept++;
      continue;
    }
    const labelMap = colByDeptLabel.get(deptId);
    if (!labelMap) {
      unresolvedColumn++;
      continue;
    }
    const isComplete = completeByTeamLabel.get(`${t.teamId}|${t.status}`) ?? false;
    // Prefer an exact column-label match, else the collapse-to-5 mapping.
    const targetLabel = labelMap.has(t.status)
      ? t.status
      : defaultColumnLabelForStatus(t.status, isComplete);
    const columnId = labelMap.get(targetLabel);
    if (!columnId) {
      unresolvedColumn++;
      continue;
    }
    const arr = idsByColumn.get(columnId);
    if (arr) arr.push(t.id);
    else idsByColumn.set(columnId, [t.id]);
  }

  let updated = 0;
  for (const [columnId, ids] of idsByColumn) {
    updated += ids.length;
    if (DRY_RUN) continue;
    // Chunk to keep the IN list reasonable.
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      await prisma.ticket.updateMany({
        where: { id: { in: chunk } },
        data: { boardColumnId: columnId },
      });
    }
  }

  console.log(
    `[backfill] tickets missing column: ${tickets.length}, assigned: ${updated}, ` +
      `no-department: ${unresolvedDept}, no-matching-column: ${unresolvedColumn}`,
  );
  console.log("[backfill] done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
