// Step 5 benchmark: compares the two SQL shapes for resolving a user's
// "exception ticket IDs" (tickets visible regardless of department scope):
//
//   Shape A (current) — three separate indexed lookups (TicketAccessGrant by
//     userId, Ticket by assigneeId, TicketAssignee by userId), unioned in JS.
//   Shape B (candidate) — one Ticket query with an OR of relational predicates
//     (assigneeId = $1 OR EXISTS assignee OR EXISTS grant).
//
// The repo deliberately runs Shape A because Shape B previously failed to use
// the assigneeId / TicketAssignee.userId indexes and scanned every assigned
// ticket (see lib/scope-cache). This script re-measures that claim against real
// data so the decision is evidence-based, not folklore. READ-ONLY: only SELECT
// and EXPLAIN ANALYZE run; nothing is written.
//
// Run: npx tsx scripts/bench-scope-resolution.ts <userId> [iterations]
//   Point DATABASE_URL at a production-LIKE dataset for a meaningful result.
import "dotenv/config"
import { Pool } from "pg"

const userId = process.argv[2]
const iterations = Number(process.argv[3] ?? 20)
if (!userId) {
  console.error("usage: npx tsx scripts/bench-scope-resolution.ts <userId> [iterations]")
  process.exit(1)
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
})

const SHAPE_A = [
  `SELECT "ticketId" FROM "TicketAccessGrant" WHERE "userId" = $1`,
  `SELECT "id" FROM "Ticket" WHERE "deletedAt" IS NULL AND "assigneeId" = $1`,
  `SELECT ta."ticketId" FROM "TicketAssignee" ta
     JOIN "Ticket" t ON t."id" = ta."ticketId"
    WHERE ta."userId" = $1 AND t."deletedAt" IS NULL`,
]

const SHAPE_B = `
  SELECT t."id" FROM "Ticket" t
   WHERE t."deletedAt" IS NULL AND (
     t."assigneeId" = $1
     OR EXISTS (SELECT 1 FROM "TicketAssignee" ta WHERE ta."ticketId" = t."id" AND ta."userId" = $1)
     OR EXISTS (SELECT 1 FROM "TicketAccessGrant" g WHERE g."ticketId" = t."id" AND g."userId" = $1)
   )`

function median(ns: number[]): number {
  const s = [...ns].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

async function timeShapeA(): Promise<number> {
  const t0 = performance.now()
  // Same fan-out the app uses: all three in parallel.
  await Promise.all(SHAPE_A.map((sql) => pool.query(sql, [userId])))
  return performance.now() - t0
}

async function timeShapeB(): Promise<number> {
  const t0 = performance.now()
  await pool.query(SHAPE_B, [userId])
  return performance.now() - t0
}

async function explain(label: string, sql: string) {
  const { rows } = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`, [userId])
  console.log(`\n── EXPLAIN ANALYZE — ${label} ──`)
  for (const r of rows) console.log((r as Record<string, string>)["QUERY PLAN"])
}

async function main() {
  console.log(`user=${userId} iterations=${iterations}\n`)

  // Warm the cache/plan once so the first-hit penalty doesn't skew medians.
  await timeShapeA()
  await timeShapeB()

  const aTimes: number[] = []
  const bTimes: number[] = []
  for (let i = 0; i < iterations; i++) {
    aTimes.push(await timeShapeA())
    bTimes.push(await timeShapeB())
  }

  const aMed = median(aTimes)
  const bMed = median(bTimes)
  console.log("Wall-clock (median over iterations):")
  console.log(`  Shape A (3 indexed lookups): ${aMed.toFixed(2)} ms`)
  console.log(`  Shape B (relational OR):     ${bMed.toFixed(2)} ms`)
  const faster = bMed < aMed ? "B" : "A"
  const delta = Math.abs(aMed - bMed)
  const pct = ((delta / Math.max(aMed, bMed)) * 100).toFixed(1)
  console.log(`  → Shape ${faster} faster by ${delta.toFixed(2)} ms (${pct}%)`)

  // Plans reveal WHY: watch for a Seq Scan on Ticket or a missing index on
  // TicketAssignee.userId / TicketAccessGrant.userId under Shape B.
  await explain("Shape B (relational OR)", SHAPE_B)
  await explain("Shape A — assigned-ticket lookup", SHAPE_A[1])

  console.log(
    "\nDecision rule (Step 5): keep Shape A unless Shape B is clearly faster on " +
      "production-scale data AND its plan uses the userId/assigneeId indexes " +
      "(no Seq Scan on Ticket) AND cross-tenant security tests still pass.",
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => pool.end())
