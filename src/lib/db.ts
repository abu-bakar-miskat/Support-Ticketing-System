import { statSync } from "fs"
import { join } from "path"
import { PrismaClient } from "@/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { withTenantScope } from "@/lib/prisma-scope"

const globalForPrisma = globalThis as unknown as {
  prisma?: InstanceType<typeof PrismaClient>
  prismaExtended?: ExtendedPrismaClient
  pool?: Pool
  databaseUrl?: string
  schemaVersion?: string
  poolRecreatePromise?: Promise<void>
}

const isDev = process.env.NODE_ENV !== "production"

function assertDatabaseUrl(connectionString: string) {
  if (/db\.[a-z0-9]+\.supabase\.co/.test(connectionString)) {
    throw new Error(
      "DATABASE_URL must use the Supabase pooler (pooler.supabase.com), not db.*.supabase.co. Restart the dev server after updating .env."
    )
  }
}

/**
 * Session pooler (port 5432) shares a small remote pool (~15). Transaction pooler
 * (port 6543) multiplexes many clients and avoids EMAXCONNSESSION errors.
 *
 * Also pins Prisma engine pool hints (`connection_limit`, `pool_timeout`) so any
 * non-adapter Prisma tooling stays at 1 client. The `pg` Pool uses `poolMax()`.
 */
export function normalizePoolerUrl(connectionString: string): string {
  let url = connectionString

  if (/pooler\.supabase\.com:5432\//.test(url)) {
    url = url.replace(
      /pooler\.supabase\.com:5432\//,
      "pooler.supabase.com:6543/",
    )
  }

  url = ensureQueryParam(url, "pgbouncer", "true")
  url = ensureQueryParam(url, "connection_limit", String(poolMax()))
  url = ensureQueryParam(url, "pool_timeout", "30")

  return url
}

/** Strip Prisma-only query params before handing the URL to node-pg. */
function toPgConnectionString(connectionString: string): string {
  const [base, query = ""] = connectionString.split("?", 2)
  if (!query) return connectionString
  const params = query
    .split("&")
    .filter(Boolean)
    .filter((p) => {
      const key = p.split("=")[0]
      return key !== "connection_limit" && key !== "pool_timeout"
    })
  return params.length > 0 ? `${base}?${params.join("&")}` : base
}

function ensureQueryParam(url: string, key: string, value: string): string {
  const re = new RegExp(`([?&])${key}=[^&]*`)
  if (re.test(url)) {
    return url.replace(re, `$1${key}=${value}`)
  }
  return `${url}${url.includes("?") ? "&" : "?"}${key}=${value}`
}

function poolMax(): number {
  // Supavisor caps CLIENT connections at 600 (compute-tier bound), shared by
  // every function instance — pool size divides that ceiling, and a deploy
  // flurry saturated it at pool-of-5 on 2026-07-29 (120 instances × 5).
  // With functions colocated in cdg1, queries run in single-digit ms, so 2
  // clients drain an RSC query batch imperceptibly slower than 5 did.
  // Raise via DB_POOL_MAX only with the 600-connection budget in mind.
  return Number(process.env.DB_POOL_MAX ?? 2)
}

function createPool(connectionString: string) {
  assertDatabaseUrl(connectionString)
  const normalized = normalizePoolerUrl(connectionString)

  const pool = new Pool({
    connectionString: toPgConnectionString(normalized),
    ssl: { rejectUnauthorized: false },
    max: poolMax(),
    // Keep connections warm across navigations — reconnecting costs ~1s RTT
    // per query burst. The transaction pooler multiplexes, so holding a few
    // idle clients is cheap relative to the reconnect penalty.
    idleTimeoutMillis: 60_000,
    keepAlive: true,
    connectionTimeoutMillis: 20_000,
    allowExitOnIdle: true,
    application_name: isDev ? "pen-tickets-dev" : "pen-tickets",
  })

  // The pooler may reap connections we hold idle; without a listener that
  // 'error' event would crash the process. The dead client is discarded and
  // the pool replaces it on the next checkout.
  pool.on("error", (err) => {
    console.warn("[db pool] idle connection error:", err.message)
  })

  // @prisma/adapter-pg attaches its own 'error' listener to this (external,
  // singleton) pool on every adapter.connect() and only removes it when that
  // connection is disposed. Our own handler above, plus one per live adapter
  // connection, plus the transient overlap while a superseded client from a
  // Turbopack HMR reload awaits $disconnect(), routinely exceeds Node's default
  // cap of 10 on this one long-lived emitter — triggering a spurious
  // MaxListenersExceededWarning. Raise the cap to a bounded value so a genuine
  // unbounded leak would still surface, rather than silencing it entirely.
  pool.setMaxListeners(Math.max(32, poolMax() * 4))

  return pool
}

function getPool() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set")
  }

  const normalized = normalizePoolerUrl(connectionString)

  if (globalForPrisma.pool && globalForPrisma.databaseUrl === normalized) {
    return globalForPrisma.pool
  }

  const stalePool = globalForPrisma.pool
  if (stalePool) {
    void stalePool.end().catch(() => {})
  }

  const pool = createPool(connectionString)
  globalForPrisma.pool = pool
  globalForPrisma.databaseUrl = normalized
  return pool
}

function getSchemaVersion() {
  try {
    const schemaPath = join(process.cwd(), "prisma/schema.prisma")
    const clientPath = join(process.cwd(), "src/generated/prisma/client.ts")
    return `${statSync(schemaPath).mtimeMs}:${statSync(clientPath).mtimeMs}`
  } catch {
    return "unknown"
  }
}

function isStalePrismaClient(client: InstanceType<typeof PrismaClient> | undefined) {
  // After schema changes, Turbopack can keep an old global client that lacks new delegates.
  // Use a try/catch access instead of `in` — Prisma delegates may live on the prototype
  // and the `in` operator can fail on Proxy-wrapped instances in some Turbopack builds.
  if (!client) return true;
  try {
    const projectFields =
      (client as { _runtimeDataModel?: { models?: { Project?: { fields?: { name: string }[] } } } })
        ._runtimeDataModel?.models?.Project?.fields ?? [];
    const ticketFields =
      (client as { _runtimeDataModel?: { models?: { Ticket?: { fields?: { name: string }[] } } } })
        ._runtimeDataModel?.models?.Ticket?.fields ?? [];
    const hasEnabledBoardSubDepartmentIds = projectFields.some(
      (f) => f.name === "enabledBoardTeamIds",
    );
    const hasTicketIsDraft = ticketFields.some((f) => f.name === "isDraft");
    return (
      (client as any).subDepartmentMembership == null ||
      (client as any).joinRequest == null ||
      (client as any).projectMember == null ||
      (client as any).department?.findMany == null ||
      (client as any).pushSubscription == null ||
      (client as any).memberSchedule == null ||
      !hasEnabledBoardSubDepartmentIds ||
      !hasTicketIsDraft
    );
  } catch {
    return true;
  }
}

function getPrisma() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set")
  }

  const normalized = normalizePoolerUrl(connectionString)
  const schemaVersion = getSchemaVersion()

  if (
    !isStalePrismaClient(globalForPrisma.prisma) &&
    globalForPrisma.prismaExtended &&
    globalForPrisma.databaseUrl === normalized &&
    globalForPrisma.schemaVersion === schemaVersion
  ) {
    return globalForPrisma.prismaExtended
  }

  void globalForPrisma.prisma?.$disconnect()

  const pool = getPool()
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
    // Under pooler contention the default 2s maxWait to *acquire* a connection
    // for a transaction is easily exceeded → P2028. Give transactions more room
    // to queue for a connection before failing. `timeout` also needs headroom:
    // a dev-server HMR recompile can pause an in-flight request for several
    // seconds mid-transaction, which otherwise blows the execution budget too.
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
  })

  globalForPrisma.prisma = prisma
  // Scope extension is outermost so it rewrites tenant-scoped args before the
  // inner connection-recovery hook runs the query against the DB.
  //
  // ROLLOUT: anonymous/background paths that query tenant-scoped models are now
  // wrapped in system/tenant scope (see withSystemScope + runWithApiKeyScope), so
  // the extension is safe to enforce beyond `ticket`. Enabled incrementally.
  const SCOPED_MODELS = ["ticket", "project", "team", "department"] as const
  globalForPrisma.prismaExtended = withTenantScope(
    withConnectionRecovery(prisma),
    SCOPED_MODELS,
  )
  globalForPrisma.schemaVersion = schemaVersion
  return globalForPrisma.prismaExtended
}

type PrismaInstance = InstanceType<typeof PrismaClient>

const CONNECTION_ERROR_CODES = new Set([
  "CONNECTION_CLOSED",
  "CONNECTION_TIMEOUT",
  "P1001", // Can't reach database server
  "P1002", // Database server closed the connection
  "P1017", // Server closed the connection
  "57P01", // terminating connection due to administrator command
  "57P03", // cannot_connect_now (database system is starting up / in recovery)
  "ETIMEDOUT",
  "EPIPE",
])

function errorText(err: unknown): string {
  if (!err || typeof err !== "object") return ""
  const e = err as Record<string, unknown>
  const cause = e.cause as Record<string, unknown> | undefined
  return [
    e.message,
    e.code,
    e.errorCode,
    cause?.message,
    cause?.originalMessage,
    cause?.code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

function isMaxConnectionsError(err: unknown): boolean {
  const msg = errorText(err)
  return (
    msg.includes("emaxconn") ||
    msg.includes("max client connections reached") ||
    // pg Pool checkout timeout — like EMAXCONN, it fails before the statement
    // ever reaches the server, so backoff-and-replay is safe even for writes.
    msg.includes("timeout exceeded when trying to connect")
  )
}

function isConnectionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const e = err as Record<string, unknown>
  const code = (e.code ?? e.errorCode ?? "") as string
  const msg = errorText(err)
  return (
    CONNECTION_ERROR_CODES.has(code) ||
    msg.includes("connection terminated") ||
    msg.includes("connection timeout") ||
    msg.includes("connection closed") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("etimedout") ||
    msg.includes("epipe") ||
    // pg marks a client dead after any socket failure; reusing it throws this.
    msg.includes("client has encountered a connection error") ||
    // Server-initiated disconnects: 57P01 admin shutdown, idle timeout reaps, etc.
    msg.includes("terminating connection") ||
    // 57P03 during instance restart windows.
    msg.includes("database system is starting up") ||
    msg.includes("database system is in recovery mode")
  )
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Operations that are safe to replay after a dropped connection: they never
// mutate, so re-running one cannot double-apply anything.
const READ_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "findRaw",
  "aggregateRaw",
])

type ModelQueryContext = {
  model: string
  operation: string
  args: unknown
  query: (args: unknown) => Promise<unknown>
}

/**
 * Connection-error recovery for model-level queries (`prisma.profile.findUnique`
 * etc.). The top-level Proxy below only covers `$transaction`/`$queryRaw`-style
 * calls; delegates must stay unwrapped for batch `$transaction`, so this logic
 * is applied through a Prisma query extension instead (see withConnectionRecovery).
 *
 * Dependencies are injected so the decision logic is unit-testable.
 */
export function createRecoveryHandler(
  recreate: () => Promise<void>,
  getFreshDelegateMethod: (model: string, operation: string) => (args: unknown) => unknown,
) {
  return async function handleModelQuery({ model, operation, args, query }: ModelQueryContext) {
    try {
      return await query(args)
    } catch (err) {
      if (isMaxConnectionsError(err)) {
        // EMAXCONN fails at connection checkout, before the statement runs,
        // so replaying any operation (including writes) is safe.
        console.warn(`[db] EMAXCONN on ${model}.${operation} — backing off`)
        await sleep(750)
        return await query(args)
      }
      if (isConnectionError(err)) {
        // The pooled socket died (suspended instance resumed, pooler reaped it,
        // network drop). Rebuild the pool so later queries get live connections.
        await recreate()
        if (READ_OPERATIONS.has(operation)) {
          console.warn(`[db] connection error on ${model}.${operation} — retrying on a fresh pool`)
          return await getFreshDelegateMethod(model, operation)(args)
        }
        // Writes are not replayed: the statement may have reached the server
        // before the socket dropped, and replaying could double-apply it.
        console.warn(
          `[db] connection error on ${model}.${operation} — pool recreated, write not replayed`,
        )
      }
      throw err
    }
  }
}

function withConnectionRecovery(client: PrismaInstance) {
  const handler = createRecoveryHandler(recreatePool, (model, operation) => {
    const fresh = getPrisma() as Record<string, any>
    const delegate = fresh[model.charAt(0).toLowerCase() + model.slice(1)]
    return (args: unknown) => delegate[operation](args)
  })

  return client.$extends({
    query: {
      $allModels: {
        $allOperations: handler as never,
      },
    },
  })
}

type ExtendedPrismaClient = ReturnType<typeof withConnectionRecovery>

/** Tear down pool+client once; concurrent callers await the same teardown. */
async function recreatePool(): Promise<void> {
  if (globalForPrisma.poolRecreatePromise) {
    await globalForPrisma.poolRecreatePromise
    return
  }

  globalForPrisma.poolRecreatePromise = (async () => {
    const oldPool = globalForPrisma.pool
    const oldPrisma = globalForPrisma.prisma
    globalForPrisma.pool = undefined
    globalForPrisma.prisma = undefined
    globalForPrisma.prismaExtended = undefined
    globalForPrisma.databaseUrl = undefined
    globalForPrisma.schemaVersion = undefined

    try {
      await oldPrisma?.$disconnect().catch(() => {})
    } catch {
      /* ignore */
    }
    try {
      await oldPool?.end().catch(() => {})
    } catch {
      /* ignore */
    }
  })()

  try {
    await globalForPrisma.poolRecreatePromise
  } finally {
    globalForPrisma.poolRecreatePromise = undefined
  }
}

export const prisma = new Proxy({} as PrismaInstance, {
  get(_target, prop) {
    const client = getPrisma() as unknown as PrismaInstance
    const value = client[prop as keyof PrismaInstance]

    // Top-level function ($transaction, $queryRaw, etc.)
    if (typeof value === "function") {
      const fn = value as (...args: unknown[]) => unknown
      return async (...args: unknown[]) => {
        try {
          return await fn.bind(client)(...args)
        } catch (err) {
          if (isMaxConnectionsError(err)) {
            console.warn(`[db] EMAXCONN on ${String(prop)} — backing off`)
            await sleep(750)
            return await fn.bind(client)(...args)
          }
          if (isConnectionError(err)) {
            console.warn(`[db] connection error on ${String(prop)} — retrying on a fresh pool`)
            await recreatePool()
            const fresh = getPrisma() as unknown as PrismaInstance
            return await (fresh[prop as keyof PrismaInstance] as (...a: unknown[]) => unknown).bind(fresh)(...args)
          }
          throw err
        }
      }
    }

    // Model delegates must stay unwrapped so methods return PrismaPromises.
    // Async wrappers break prisma.$transaction([...]) batch form.
    if (value !== null && typeof value === "object") {
      return value
    }

    return value
  },
})
