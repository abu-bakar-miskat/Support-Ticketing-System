import { createHash } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export type ApiKeyContext = {
  keyId: string
  departmentId: string | null
  scope: string
  createdById: string
  creatorName: string
}

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

/** Generate a new API key. Returns the raw key (shown once) and the values to store. */
export function generateApiKey(): { raw: string; hashed: string; suffix: string } {
  const { randomBytes } = require("crypto") as typeof import("crypto")
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
  const result = await requireApiKeyRaw(raw)
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
): Promise<
  | { ctx: ApiKeyContext; error: null }
  | { ctx: null; error: { message: string; status: number } }
> {
  if (!raw.startsWith("pen_")) {
    return { ctx: null, error: { message: "Invalid API key format", status: 401 } }
  }

  const hashed = hashKey(raw)
  const key = await prisma.apiKey.findUnique({
    where: { hashedKey: hashed },
    select: {
      id: true,
      revokedAt: true,
      scope: true,
      departmentId: true,
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

  // Stamp lastUsedAt asynchronously — don't block the response
  prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined)

  return {
    ctx: {
      keyId: key.id,
      departmentId: key.departmentId,
      scope: key.scope,
      createdById: key.createdById,
      creatorName: key.createdBy.name,
    },
    error: null,
  }
}
