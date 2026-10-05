import "server-only"

import { NextRequest, NextResponse } from "next/server"
import { requireApiKey, type ApiKeyContext } from "@/lib/api-key-auth"
import { clientIp, publicRateLimited } from "@/lib/public-rate-limit"

const MAX_JSON_BYTES = 1_000_000

export function portalJson(body: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init)
  response.headers.set("Cache-Control", "no-store")
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("Referrer-Policy", "no-referrer")
  return response
}

/** Tenant portal keys are tenant-wide, never department-bound or system-wide. */
export async function requirePortalApiKey(
  request: NextRequest,
  options: { write?: boolean } = {},
): Promise<
  | { ctx: ApiKeyContext & { tenantId: string }; error: null }
  | { ctx: null; error: NextResponse }
> {
  const result = await requireApiKey(request, { allowPortal: true })
  if (result.error) return result

  if (result.ctx.departmentId) {
    return {
      ctx: null,
      error: portalJson(
        { error: "Use a tenant key generated from Departments → Generate API" },
        { status: 403 },
      ),
    }
  }

  if (result.ctx.kind !== "portal") {
    return {
      ctx: null,
      error: portalJson(
        { error: "Use a portal key generated from Departments → Generate API" },
        { status: 403 },
      ),
    }
  }

  if (!result.ctx.formConfigId) {
    return {
      ctx: null,
      error: portalJson(
        { error: "This portal key does not have a support form" },
        { status: 409 },
      ),
    }
  }

  if (
    options.write &&
    result.ctx.scope !== "read_write" &&
    result.ctx.scope !== "admin"
  ) {
    return {
      ctx: null,
      error: portalJson({ error: "This API key is read-only" }, { status: 403 }),
    }
  }

  return result as { ctx: ApiKeyContext & { tenantId: string }; error: null }
}

export function enforcePortalRateLimit(
  request: NextRequest,
  keyId: string,
  limit = 60,
): NextResponse | null {
  const bucket = `portal:${keyId}:${clientIp(request)}`
  if (!publicRateLimited(bucket, limit, 60_000)) return null
  const response = portalJson({ error: "Too many requests" }, { status: 429 })
  response.headers.set("Retry-After", "60")
  return response
}

export async function readPortalJson(
  request: NextRequest,
): Promise<{ data: Record<string, unknown>; error: null } | { data: null; error: NextResponse }> {
  const contentLength = Number(request.headers.get("content-length") ?? "0")
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BYTES) {
    return { data: null, error: portalJson({ error: "Request body is too large" }, { status: 413 }) }
  }

  const contentType = request.headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return { data: null, error: portalJson({ error: "Content-Type must be application/json" }, { status: 415 }) }
  }

  try {
    const value: unknown = await request.json()
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid")
    return { data: value as Record<string, unknown>, error: null }
  } catch {
    return { data: null, error: portalJson({ error: "Invalid JSON body" }, { status: 400 }) }
  }
}

export function cleanString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}
