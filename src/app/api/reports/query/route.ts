import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { resolveReportScope } from "@/lib/reporting/report-scope";
import { computeVolumeReport } from "@/lib/reporting/volume-report";
import { computeResolutionTimeReport } from "@/lib/reporting/resolution-time-report";
import { computeCustomFieldReport } from "@/lib/reporting/custom-field-report";
import { computeCrossDepartmentReport } from "@/lib/reporting/cross-department-report";
import { REPORT_TYPES, type ReportType } from "@/lib/reporting/export-doc";
import type { FormFieldFilter } from "@/lib/board-search";

function isReportType(v: string | null): v is ReportType {
  return !!v && (REPORT_TYPES as readonly string[]).includes(v);
}

/**
 * RPT-01/02/04/06/07: live report data for a dashboard. Every branch is
 * bound by `resolveReportScope` — a regular staff/manager only ever sees
 * their own department/sub-department teams; cross-department aggregation
 * is only reachable with Project Admin (tenant-admin) scope.
 */
export async function GET(request: NextRequest) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const sp = request.nextUrl.searchParams;
  const reportType = sp.get("reportType");
  if (!isReportType(reportType)) {
    return NextResponse.json({ error: `reportType must be one of ${REPORT_TYPES.join(", ")}` }, { status: 400 });
  }
  const startParam = sp.get("start");
  const endParam = sp.get("end");
  if (!startParam || !endParam) {
    return NextResponse.json({ error: "start and end are required" }, { status: 400 });
  }
  const start = new Date(startParam);
  const end = new Date(endParam);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NextResponse.json({ error: "Invalid start/end date" }, { status: 400 });
  }

  const scope = await resolveReportScope(profile!);
  if (scope.kind === "none") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (reportType === "cross_department") {
    if (scope.kind !== "cross_department") {
      return NextResponse.json(
        { error: "Cross-department reports require Project Admin access" },
        { status: 403 },
      );
    }
    const buckets = await computeCrossDepartmentReport(scope.tenantId, start, end);
    return NextResponse.json({ reportType, buckets });
  }

  if (reportType === "volume") {
    const report = await computeVolumeReport(scope, start, end);
    return NextResponse.json({ reportType, ...report });
  }

  if (reportType === "resolution_time") {
    const report = await computeResolutionTimeReport(scope, start, end);
    return NextResponse.json({ reportType, ...report });
  }

  // custom_field
  const groupByFieldId = sp.get("groupByFieldId");
  if (!groupByFieldId) {
    return NextResponse.json({ error: "groupByFieldId is required for custom_field reports" }, { status: 400 });
  }
  const filtersRaw = sp.get("filters");
  let filters: FormFieldFilter[] | undefined;
  if (filtersRaw) {
    try {
      const parsed = JSON.parse(filtersRaw);
      if (Array.isArray(parsed)) {
        filters = parsed.filter(
          (f): f is FormFieldFilter => typeof f?.fieldId === "string" && typeof f?.value === "string",
        );
      }
    } catch {
      return NextResponse.json({ error: "filters must be valid JSON" }, { status: 400 });
    }
  }
  const buckets = await computeCustomFieldReport({ scope, start, end, groupByFieldId, filters });
  return NextResponse.json({ reportType, buckets });
}
