/**
 * Step 4 account repair: remove Mohammed Sifat's obsolete Support department
 * manager grant while preserving UI UX sub-manager membership.
 *
 * Run: npx tsx scripts/repair-sifat-support-manager-grant.ts
 * Dry run: npx tsx scripts/repair-sifat-support-manager-grant.ts --dry-run
 */
import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { Role } from "../src/generated/prisma/enums";

const TARGET_EMAIL = "mohammed.sifat@penglobalbd.com";
const SUPPORT_DEPARTMENT_ID = "cmtk1qlyn0006ejjxe48p07dk";
const UI_UX_SUB_DEPARTMENT_ID = "cmtlc7ztz000gvdjxaxjoqec7";
const TENANT_ID = "2ade549c-73f3-4147-b64a-8ad72bba1712";

const dryRun = process.argv.includes("--dry-run");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type ScopeRow = {
  role: Role;
  scopeType: "PLATFORM" | "TENANT" | "DEPARTMENT" | "SUB_DEPARTMENT";
  scopeId: string | null;
};

function deriveEffectiveRole(rows: ScopeRow[]): Role {
  const has = (pred: (r: ScopeRow) => boolean) => rows.some(pred);
  if (has((r) => r.scopeType === "TENANT" && r.role === "admin")) return "admin";
  if (has((r) => r.scopeType === "DEPARTMENT" && r.role === "admin")) return "manager";
  if (has((r) => r.scopeType === "DEPARTMENT" && r.role === "manager")) return "manager";
  if (has((r) => r.scopeType === "TENANT" && r.role === "manager")) return "manager";
  if (has((r) => r.role === "sub_manager")) return "sub_manager";
  return "agent";
}

type Db = Pick<
  PrismaClient,
  | "profile"
  | "tenantMembership"
  | "departmentManager"
  | "departmentMember"
  | "departmentAccess"
  | "subDepartmentMembership"
  | "roleAssignment"
>;

async function deriveAssignmentsFrom(db: Db, userId: string): Promise<ScopeRow[]> {
  const [profile, tenantM, deptMgr, deptMem, deptAcc, subDepartmentM] = await Promise.all([
    db.profile.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } }),
    db.tenantMembership.findMany({ where: { userId, isActive: true }, select: { role: true, tenantId: true } }),
    db.departmentManager.findMany({ where: { userId }, select: { departmentId: true, role: true } }),
    db.departmentMember.findMany({ where: { userId }, select: { departmentId: true } }),
    db.departmentAccess.findMany({
      where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { departmentId: true },
    }),
    db.subDepartmentMembership.findMany({
      where: { userId, isActive: true },
      select: { role: true, subDepartmentId: true },
    }),
  ]);

  const rows: ScopeRow[] = [];
  if (profile?.isSuperAdmin) rows.push({ role: "admin", scopeType: "PLATFORM", scopeId: null });
  for (const t of tenantM) rows.push({ role: t.role, scopeType: "TENANT", scopeId: t.tenantId });
  for (const d of deptMgr) {
    rows.push({
      role: d.role === "admin" ? "admin" : "manager",
      scopeType: "DEPARTMENT",
      scopeId: d.departmentId,
    });
  }
  for (const d of deptMem) rows.push({ role: "agent", scopeType: "DEPARTMENT", scopeId: d.departmentId });
  for (const a of deptAcc) rows.push({ role: "agent", scopeType: "DEPARTMENT", scopeId: a.departmentId });
  for (const tm of subDepartmentM) {
    rows.push({ role: tm.role, scopeType: "SUB_DEPARTMENT", scopeId: tm.subDepartmentId });
  }

  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.role}|${r.scopeType}|${r.scopeId ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function synchronizeRoleAssignments(db: Db, userId: string) {
  const derived = await deriveAssignmentsFrom(db, userId);
  const data = derived.map((r) => ({
    userId,
    role: r.role,
    scopeType: r.scopeType,
    scopeId: r.scopeId,
  }));
  await db.roleAssignment.deleteMany({ where: { userId } });
  if (data.length > 0) await db.roleAssignment.createMany({ data });
}

async function deriveAssignments(userId: string) {
  return deriveAssignmentsFrom(prisma, userId);
}

async function main() {
  const target = await prisma.profile.findUnique({
    where: { email: TARGET_EMAIL },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!target) throw new Error(`Profile not found: ${TARGET_EMAIL}`);

  const actor = await prisma.profile.findFirst({
    where: { isSuperAdmin: true, deletedAt: null },
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: "asc" },
  });
  if (!actor) throw new Error("No super-admin actor available for audit");

  const beforeRows = await deriveAssignments(target.id);
  const beforeEffective = deriveEffectiveRole(beforeRows);

  const supportManager = beforeRows.find(
    (r) => r.scopeType === "DEPARTMENT" && r.scopeId === SUPPORT_DEPARTMENT_ID && r.role === "manager",
  );
  const uiUxSubManager = beforeRows.find(
    (r) =>
      r.scopeType === "SUB_DEPARTMENT" &&
      r.scopeId === UI_UX_SUB_DEPARTMENT_ID &&
      r.role === "sub_manager",
  );

  console.log("=== Repair preview ===");
  console.log("Target:", target);
  console.log("Actor:", actor);
  console.log("Effective role (before):", beforeEffective);
  console.log("Support manager grant:", supportManager ?? "(none)");
  console.log("UI UX sub-manager grant:", uiUxSubManager ?? "(none)");
  console.log("\nPlanned change:");
  console.log(`  REVOKE department manager @ Support (${SUPPORT_DEPARTMENT_ID})`);
  console.log("  RETAIN sub-manager @ UI UX / LPC");
  console.log("  RETAIN tenant agent membership");

  if (!supportManager) {
    console.log("\nNo Support manager grant found — nothing to repair.");
    return;
  }

  if (dryRun) {
    console.log("\n--dry-run: no changes written.");
    return;
  }

  const changeBefore = [{ scopeType: "DEPARTMENT" as const, scopeId: SUPPORT_DEPARTMENT_ID, role: "manager" as const }];
  const changeAfter = [{ scopeType: "DEPARTMENT" as const, scopeId: SUPPORT_DEPARTMENT_ID, role: "agent" as const }];

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Profile" WHERE "id" = ${target.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Profile" WHERE "id" = ${actor.id} FOR UPDATE`;

    const stillManager = await tx.departmentManager.findUnique({
      where: { departmentId_userId: { departmentId: SUPPORT_DEPARTMENT_ID, userId: target.id } },
      select: { role: true },
    });
    if (!stillManager || stillManager.role !== "manager") {
      throw new Error("Support manager grant changed since preview — aborting.");
    }

    await tx.departmentManager.deleteMany({
      where: { departmentId: SUPPORT_DEPARTMENT_ID, userId: target.id },
    });

    await synchronizeRoleAssignments(tx, target.id);

    await tx.auditEvent.create({
      data: {
        tenantId: TENANT_ID,
        actorId: actor.id,
        action: "ROLE_ASSIGNMENTS_CHANGED",
        targetType: "Profile",
        targetId: target.id,
        before: changeBefore,
        after: changeAfter,
      },
    });
  });

  const afterRows = await deriveAssignments(target.id);
  const afterEffective = deriveEffectiveRole(afterRows);

  console.log("\n=== Repair complete ===");
  console.log("Effective role (after):", afterEffective);
  console.log("Remaining assignments:", afterRows);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
