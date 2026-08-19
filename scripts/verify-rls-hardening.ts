/**
 * Ticket #23 (D-02, C-01) — verifies the RLS hardening migration actually
 * works: connects as the restricted `app_rls_user` role (via `SET ROLE`,
 * requiring the connecting role to be a member — see the rls_hardening
 * migration) and proves:
 *   1. A deliberately un-guarded query (no app.tenant_id GUC set) returns
 *      zero rows — fail-closed.
 *   2. Setting app.tenant_id to one real tenant returns only that tenant's
 *      rows, never another tenant's.
 *   3. app.is_platform_admin=true bypasses the tenant filter (the escape
 *      hatch mirroring the app-layer super-admin bypass).
 *
 * Read-only — runs inside a transaction that's always rolled back, so it's
 * safe to re-run against the shared DB at any time (e.g. after a future
 * cutover to confirm the policies still hold).
 *
 * Usage: npx tsx scripts/verify-rls-hardening.ts
 */
import { readFileSync } from "fs";
import path from "path";
import { Client } from "pg";

const RLS_ROLE = "app_rls_user";

function loadEnvVar(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const env = readFileSync(path.join(process.cwd(), ".env"), "utf8");
  const m = env.match(new RegExp(`^${name}\\s*=\\s*"?([^"\\n]+)"?\\s*$`, "m"));
  return m?.[1];
}

async function main() {
  const connectionString = loadEnvVar("DIRECT_URL") ?? loadEnvVar("DATABASE_URL");
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const tenants = await client.query<{ id: string; name: string; count: string }>(
      `select t.id, t.name, count(k.id)::text as count
       from "Tenant" t join "Ticket" k on k."tenantId" = t.id
       group by t.id, t.name having count(k.id) > 0
       order by count desc limit 2`,
    );
    if (tenants.rows.length < 2) {
      console.error("Need at least 2 tenants with tickets to verify cross-tenant isolation. Aborting.");
      process.exit(1);
    }
    const [tenantA, tenantB] = tenants.rows;
    console.log(`Using tenants: ${tenantA.name} (${tenantA.count} tickets), ${tenantB.name} (${tenantB.count} tickets)`);

    await client.query("BEGIN");
    try {
      await client.query(`SET ROLE ${RLS_ROLE}`);

      const unguarded = await client.query('select count(*) from "Ticket"');
      const unguardedCount = Number(unguarded.rows[0].count);
      console.log(`[1] Un-guarded query (no GUC set): ${unguardedCount} rows`, unguardedCount === 0 ? "✅" : "❌ FAIL — expected 0");

      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantA.id]);
      const scopedA = await client.query('select "tenantId" from "Ticket"');
      const leaksA = scopedA.rows.filter((r) => r.tenantId !== tenantA.id);
      console.log(
        `[2] GUC=${tenantA.name}: ${scopedA.rows.length} rows, ${leaksA.length} cross-tenant leaks`,
        scopedA.rows.length === Number(tenantA.count) && leaksA.length === 0 ? "✅" : "❌ FAIL",
      );

      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantB.id]);
      const scopedB = await client.query('select "tenantId" from "Ticket"');
      const leaksB = scopedB.rows.filter((r) => r.tenantId !== tenantB.id);
      console.log(
        `[3] GUC=${tenantB.name}: ${scopedB.rows.length} rows, ${leaksB.length} cross-tenant leaks`,
        scopedB.rows.length === Number(tenantB.count) && leaksB.length === 0 ? "✅" : "❌ FAIL",
      );

      await client.query(`SELECT set_config('app.is_platform_admin', 'true', true)`);
      const asAdmin = await client.query('select count(*) from "Ticket"');
      console.log(
        `[4] is_platform_admin=true: ${asAdmin.rows[0].count} rows (bypasses tenant filter)`,
        Number(asAdmin.rows[0].count) >= Number(tenantA.count) + Number(tenantB.count) ? "✅" : "❌ FAIL",
      );
    } finally {
      await client.query("ROLLBACK");
      await client.query("RESET ROLE");
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
