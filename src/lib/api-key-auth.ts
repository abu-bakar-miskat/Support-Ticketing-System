import { createHash, randomBytes } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { runWithScope } from "@/lib/request-scope"

export type ApiKeyContext = {
  keyId: string
  departmentId: string | null
  formConfigId?: string | null
  /** Tenant that owns the key. Authentication fails when it cannot be resolved. */
  tenantId: string | null
  scope: string
  kind?: string
  createdById: string
  creatorName: string
}

/**
 * Run `fn` under the API key's tenant scope so the non-bypassable extension
 * enforces isolation on every tenant-scoped read the handler makes. Both
 * department and tenant-wide keys must resolve a tenant; unbound legacy keys
 * fail authentication. This is the API-key equivalent of a request establishing
 * scope via `getProfile`.
 */
export function runWithApiKeyScope<T>(ctx: ApiKeyContext, fn: () => T): T {
  if (!ctx.tenantId) throw new Error("API key scope requires a tenant")
  return runWithScope({ tenantIds: [ctx.tenantId] }, fn)
}

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

/** Generate a new API key. Returns the raw key (shown once) and the values to store. */
export function generateApiKey(): { raw: string; hashed: string; suffix: string } {
  const raw = "pen_" + randomBytes(24).toString("base64url")
  const suffix = raw.slice(-4)
  const hashed = hashKey(raw)
  return { raw, hashed, suffix }
}

/**
 * Validate an API key from the Authorization header.
 * Stamps lastUsedAt and returns the key context on success.
 */
export async function requireApiKey(
  req: NextRequest,
  options: { allowPortal?: boolean } = {},
): Promise<{ ctx: ApiKeyContext; error: null } | { ctx: null; error: NextResponse }> {
  const auth = req.headers.get("authorization") ?? ""
  if (!auth.startsWith("Bearer ")) {
    return {
      ctx: null,
      error: NextResponse.json(
        { error: "Missing or malformed Authorization header. Use: Bearer <key>" },
        { status: 401 },
      ),
    }
  }

  const raw = auth.slice(7).trim()
  const result = await requireApiKeyRaw(raw, options)
  if (result.error) {
    return {
      ctx: null,
      error: NextResponse.json({ error: result.error.message }, { status: result.error.status }),
    }
  }
  return result
}

/**
 * Validate a raw API key string (no HTTP parsing) — for callers that carry
 * the key outside the Authorization header, e.g. the MCP route's path
 * segment. Stamps lastUsedAt and returns the key context on success.
 */
export async function requireApiKeyRaw(
  raw: string,
  options: { allowPortal?: boolean } = {},
): Promise<
  | { ctx: ApiKeyContext; error: null }
  | { ctx: null; error: { message: string; status: number } }
> {
  if (!/^pen_[A-Za-z0-9_-]{32}$/.test(raw)) {
    return { ctx: null, error: { message: "Invalid API key format", status: 401 } }
  }

  const hashed = hashKey(raw)
  const key = await prisma.apiKey.findUnique({
    where: { hashedKey: hashed },
    select: {
      id: true,
      revokedAt: true,
      scope: true,
      kind: true,
      tenantId: true,
      tenant: { select: { id: true, status: true, deletedAt: true } },
      departmentId: true,
      formConfigId: true,
      department: {
        select: {
          tenantId: true,
          tenant: { select: { id: true, status: true, deletedAt: true } },
        },
      },
      createdById: true,
      createdBy: { select: { name: true } },
    },
  })

  if (!key) {
    return { ctx: null, error: { message: "Invalid API key", status: 401 } }
  }
  if (key.revokedAt !== null) {
    return { ctx: null, error: { message: "API key has been revoked", status: 401 } }
  }
  if (key.kind === "portal" && !options.allowPortal) {
    return {
      ctx: null,
      error: { message: "This key is restricted to the Support Portal API", status: 403 },
    }
  }

  const tenant = key.tenant ?? key.department?.tenant ?? null
  const tenantId = tenant?.id ?? key.tenantId ?? key.department?.tenantId ?? null
  if (!tenantId || !tenant) {
    // Never let a department-less legacy key acquire system-wide scope. These
    // keys must be replaced by a tenant-bound key from Generate API.
    return { ctx: null, error: { message: "API key is not bound to a tenant", status: 401 } }
  }
  if (tenant.status !== "active" || tenant.deletedAt !== null) {
    return { ctx: null, error: { message: "API key tenant is unavailable", status: 403 } }
  }

  // Stamp lastUsedAt asynchronously — don't block the response
  prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined)

  return {
    ctx: {
      keyId: key.id,
      departmentId: key.departmentId,
      formConfigId: key.formConfigId,
      tenantId,
      scope: key.scope,
      kind: key.kind,
      createdById: key.createdById,
      creatorName: key.createdBy.name,
    },
    error: null,
  }
}
