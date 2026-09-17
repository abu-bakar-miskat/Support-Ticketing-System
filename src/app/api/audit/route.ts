import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { buildAuditLogFeed, type AuditFeedFilters } from "@/lib/audit-log-feed";
import type { AuditScopeKind, AuditSource } from "@/lib/audit-log-types";

/**
 * Unified audit feed — merges the per-ticket ActivityLog and the admin
 * AuditEvent tables into one createdAt-desc stream (see lib/audit-log-feed.ts).
 *
 *  - scope=department: every department the caller can reach (agents see only
 *    their own ticket activity; managers/admins additionally see the
 *    department's governance events).
 *  - scope=platform:   all tenants/departments — super admins (or, restricted to
 *    their own tenants, tenant admins). Non-privileged callers get an empty feed.
 *
 * Read-only; scope is enforced server-side regardless of query params.
 */
export async function GET(req: NextRequest) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const sp = req.nextUrl.searchParams;
  const kind: AuditScopeKind = sp.get("scope") === "platform" ? "platform" : "department";

  const sourceParam = sp.get("source");
  const source: AuditSource | null =
    sourceParam === "ticket" || sourceParam === "admin" ? sourceParam : null;

  function parseDate(s: string | null, endOfDay = false): Date | null {
    if (!s) return null;
    const d = s.includes("T") ? new Date(s) : new Date(s + (endOfDay ? "T23:59:59.999" : "T00:00:00.000"));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const filters: AuditFeedFilters = {
    source,
    action: sp.get("action"),
    actorId: sp.get("actorId"),
    tenantId: sp.get("tenantId"),
    departmentId: sp.get("departmentId"),
    from: parseDate(sp.get("from")),
    to: parseDate(sp.get("to"), true),
  };

  const { entries, nextCursor } = await buildAuditLogFeed(profile!, kind, filters, sp.get("cursor"));

  return NextResponse.json({ entries, nextCursor });
}
