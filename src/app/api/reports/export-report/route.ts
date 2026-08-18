import { NextRequest, NextResponse, after } from "next/server";
import { requireAuth } from "@/lib/auth";
import { resolveReportScope } from "@/lib/reporting/report-scope";
import { buildReportExportDoc, REPORT_TYPES, type ReportType } from "@/lib/reporting/export-doc";
import { createReportExportJob, runReportExportJobAsSystem } from "@/lib/reporting/report-export-job";
import { exportFileName } from "@/lib/exports/report-doc";
import { buildCsv } from "@/lib/exports/to-csv";
import { buildXlsx } from "@/lib/exports/to-xlsx";
import { buildPdf } from "@/lib/exports/to-pdf";
import type { FormFieldFilter } from "@/lib/board-search";
import type { ReportExportFormat } from "@/generated/prisma/enums";
import { assertFeatureEnabled } from "@/lib/feature-flags";

// RPT-05: exports at or below this many rows return synchronously; above it,
// the request kicks off a ReportExportJob and returns 202 + a job id instead.
const ROW_THRESHOLD = 500;

const FORMATS: Record<ReportExportFormat, { ext: string; contentType: string }> = {
  CSV: { ext: "csv", contentType: "text/csv; charset=utf-8" },
  XLSX: { ext: "xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  PDF: { ext: "pdf", contentType: "application/pdf" },
};

function isReportType(v: unknown): v is ReportType {
  return typeof v === "string" && (REPORT_TYPES as readonly string[]).includes(v);
}

/**
 * RPT-01/02/04/05/06/07: builds and exports a report (as opposed to
 * /api/reports/export, which only *formats* a client-supplied ExportDoc).
 * Runs the exact same query functions as /api/reports/query, so the export
 * always matches what the live dashboard shows.
 */
export async function POST(request: NextRequest) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const reportType = body?.reportType;
  if (!isReportType(reportType)) {
    return NextResponse.json({ error: `reportType must be one of ${REPORT_TYPES.join(", ")}` }, { status: 400 });
  }
  const format = body?.format as ReportExportFormat;
  if (!(format in FORMATS)) {
    return NextResponse.json({ error: "format must be one of CSV, XLSX, PDF" }, { status: 400 });
  }
  const start = typeof body?.start === "string" ? body.start : null;
  const end = typeof body?.end === "string" ? body.end : null;
  if (!start || !end) {
    return NextResponse.json({ error: "start and end are required" }, { status: 400 });
  }
  const groupByFieldId = typeof body?.groupByFieldId === "string" ? body.groupByFieldId : undefined;
  const filters: FormFieldFilter[] | undefined = Array.isArray(body?.filters)
    ? body.filters.filter(
        (f: unknown): f is FormFieldFilter =>
          typeof (f as FormFieldFilter)?.fieldId === "string" && typeof (f as FormFieldFilter)?.value === "string",
      )
    : undefined;
  const reportParams = { start, end, groupByFieldId, filters };

  const scope = await resolveReportScope(profile!);
  if (scope.kind === "none") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (reportType === "cross_department" && scope.kind !== "cross_department") {
    return NextResponse.json({ error: "Cross-department reports require Project Admin access" }, { status: 403 });
  }

  // SA-04: a Super Admin can disable report exports per tenant.
  const exportTenantId = scope.kind === "cross_department" ? scope.tenantId : profile!.activeTenantId;
  if (exportTenantId) {
    const featureCheck = await assertFeatureEnabled(exportTenantId, "customReports");
    if (!featureCheck.ok) {
      return NextResponse.json({ error: featureCheck.error }, { status: 403 });
    }
  }

  let result: Awaited<ReturnType<typeof buildReportExportDoc>>;
  try {
    result = await buildReportExportDoc(reportType, reportParams, scope);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to build report" }, { status: 400 });
  }

  if (result.rowCount > ROW_THRESHOLD) {
    const tenantId = scope.kind === "cross_department" ? scope.tenantId : profile!.activeTenantId ?? "";
    const job = await createReportExportJob({
      tenantId,
      createdById: profile!.id,
      reportType,
      format,
      reportParams,
      scope,
    });
    after(() => runReportExportJobAsSystem(job.id));
    return NextResponse.json({ jobId: job.id, status: job.status, rowCount: result.rowCount }, { status: 202 });
  }

  const { ext, contentType } = FORMATS[format];
  let fileBody: Buffer | string;
  if (format === "CSV") fileBody = buildCsv(result.doc);
  else if (format === "XLSX") fileBody = await buildXlsx(result.doc);
  else fileBody = await buildPdf(result.doc);

  return new NextResponse(fileBody as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${exportFileName(reportType, ext)}"`,
      "Cache-Control": "no-store",
    },
  });
}
