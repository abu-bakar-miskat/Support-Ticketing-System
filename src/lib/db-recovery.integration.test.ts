/**
 * Live-database integration test for connection recovery.
 *
 * Opt-in: `DB_INTEGRATION=1 npx vitest run src/lib/db-recovery.integration.test.ts`
 *
 * Reproduces the production failure mode behind the "Database unavailable"
 * screen — a pooled connection dying under the app — against the real
 * database. Safe on the shared dev DB: it connects via DIRECT_URL (session
 * mode, dedicated backend per connection) and only ever terminates its OWN
 * backends, never anyone else's.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { Client } from "pg"

function loadEnvVar(name: string): string | undefined {
  if (process.env[name]) return process.env[name]
  try {
    const env = fs.readFileSync(path.resolve(__dirname, "../../.env"), "utf8")
    const m = env.match(new RegExp(`^${name}=["']?([^"'\\n]+)`, "m"))
    return m?.[1]
  } catch {
    return undefined
  }
}

const directUrl = process.env.DB_INTEGRATION === "1" ? loadEnvVar("DIRECT_URL") : undefined

describe.runIf(Boolean(directUrl))("connection recovery against the live database", () => {
  let prisma: typeof import("./db").prisma
  let admin: Client

  beforeAll(async () => {
    // Dedicated backend (session mode) + a single-connection pool make the
    // "which backend am I killing" question deterministic and self-scoped.
    process.env.DATABASE_URL = directUrl
    process.env.DB_POOL_MAX = "1"
    ;({ prisma } = await import("./db"))

    admin = new Client({ connectionString: directUrl, ssl: { rejectUnauthorized: false } })
    await admin.connect()
  })

  afterAll(async () => {
    await admin?.end()
  })

  it("survives its pooled connection being killed while idle", async () => {
    const before = await prisma.profile.count()
    expect(typeof before).toBe("number")

    const [{ pid }] = await prisma.$queryRaw<[{ pid: number }]>`select pg_backend_pid() as pid`
    await admin.query("select pg_terminate_backend($1)", [pid])
    await new Promise((r) => setTimeout(r, 300))

    // Pre-recovery code surfaced this as the "Database unavailable" screen.
    const after = await prisma.profile.count()
    expect(after).toBe(before)
  })

  it("classifies a real 57P01 server disconnect and recreates the pool", async () => {
    const warn = vi.spyOn(console, "warn")

    // Self-terminate mid-query: the server answers with a genuine 57P01
    // ("terminating connection due to administrator command"). The top-level
    // recovery replays it once on a fresh pool, which self-terminates again,
    // so the error ultimately propagates — proving the signature matched and
    // recovery ran, with real errors instead of the unit tests' fakes.
    await expect(
      prisma.$queryRaw`select pg_terminate_backend(pg_backend_pid())`,
    ).rejects.toThrow()

    expect(warn.mock.calls.some(([msg]) => String(msg).includes("[db] connection error on $queryRaw"))).toBe(true)
    warn.mockRestore()

    // The pool must come back healthy for the next request.
    const count = await prisma.profile.count()
    expect(typeof count).toBe("number")
  })
})
