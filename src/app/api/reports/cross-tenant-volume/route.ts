import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { resolveUserScope } from "@/lib/role-assignment";
import { canViewCrossTenantVolume } from "@/lib/reporting/report-scope";
import {
  computeCrossTenantTicketDrilldown,
  computeCrossTenantVolumeReport,
} from "@/lib/reporting/cross-tenant-volume-report";
import { runAsSystem } from "@/lib/request-scope";

/**
 * TC-038: Super Admin cross-tenant ticket volume for a date window, plus a
 * single-tenant drill-down. Tenant Admins are rejected here (TC-039 keeps
 * them on `/api/reports/query`, which binds `tenantId` in the where clause).
 *
 * The aggregate and the drill-down both run under system scope because a
 * platform admin's Prisma extension does not inject a tenant predicate.
 * Isolation is the `tenantId` equality on the drill-down query.
 */
export async function GET(request: NextRequest) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const userScope = await resolveUserScope(profile!.id);
  if (!canViewCrossTenantVolume({ ...userScope, isSuperAdmin: profile!.isSuperAdmin })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const startParam = sp.get("start");
  const endParam = sp.get("end");
  if (!startParam || !endParam) {
    return NextResponse.json({ error: "start and end are required" }, { status: 400 });
  }
  const start = new Date(startParam);
  const end = new Date(endParam);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    return NextResponse.json({ error: "Invalid start/end date" }, { status: 400 });
  }

  const tenantId = sp.get("tenantId");
  if (tenantId) {
    const tickets = await runAsSystem(() =>
      computeCrossTenantTicketDrilldown(tenantId, start, end),
    );
    return NextResponse.json({
      mode: "drilldown",
      range: { start, end },
      tenantId,
      tickets,
    });
  }

  const tenants = await runAsSystem(() => computeCrossTenantVolumeReport(start, end));
  return NextResponse.json({
    mode: "aggregate",
    range: { start, end },
    tenants,
  });
}
