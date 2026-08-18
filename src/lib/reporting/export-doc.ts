import "server-only";
import type { ExportDoc } from "@/lib/exports/report-doc";
import type { FormFieldFilter } from "@/lib/board-search";
import { computeVolumeReport } from "@/lib/reporting/volume-report";
import { computeResolutionTimeReport } from "@/lib/reporting/resolution-time-report";
import { computeCustomFieldReport } from "@/lib/reporting/custom-field-report";
import { computeCrossDepartmentReport } from "@/lib/reporting/cross-department-report";
import type { ReportScope } from "@/lib/reporting/report-scope";

export const REPORT_TYPES = ["volume", "resolution_time", "custom_field", "cross_department"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export type ReportRequestParams = {
  start: string; // ISO date
  end: string;
  /** Required for "custom_field" (RPT-04). */
  groupByFieldId?: string;
  filters?: FormFieldFilter[];
};

/**
 * Builds the report data as a transport-agnostic `ExportDoc` — shared by the
 * live JSON endpoints, the synchronous export path, and the async
 * ReportExportJob runner (RPT-05), so all three always compute the exact
 * same numbers from the exact same query functions.
 */
export async function buildReportExportDoc(
  reportType: ReportType,
  params: ReportRequestParams,
  scope: ReportScope,
): Promise<{ doc: ExportDoc; rowCount: number }> {
  const start = new Date(params.start);
  const end = new Date(params.end);
  const subtitle = `${params.start} to ${params.end}`;

  if (reportType === "volume") {
    const report = await computeVolumeReport(scope, start, end);
    const rows = report.current.map((b) => ({ category: b.category, type: b.type, count: b.count }));
    return {
      doc: {
        title: "Ticket Volume by Category/Type",
        subtitle,
        sheets: [
          {
            name: "Volume",
            columns: [
              { key: "category", header: "Category" },
              { key: "type", header: "Type" },
              { key: "count", header: "Count" },
            ],
            rows,
          },
        ],
      },
      rowCount: rows.length,
    };
  }

  if (reportType === "resolution_time") {
    const report = await computeResolutionTimeReport(scope, start, end);
    const rows = Object.entries(report.current).map(([priority, stats]) => ({
      priority,
      count: stats.count,
      meanMins: stats.meanMins ?? "",
      medianMins: stats.medianMins ?? "",
    }));
    return {
      doc: {
        title: "Resolution Time by Priority",
        subtitle,
        sheets: [
          {
            name: "Resolution Time",
            columns: [
              { key: "priority", header: "Priority" },
              { key: "count", header: "Resolved Count" },
              { key: "meanMins", header: "Mean (mins)" },
              { key: "medianMins", header: "Median (mins)" },
            ],
            rows,
          },
        ],
      },
      rowCount: rows.length,
    };
  }

  if (reportType === "custom_field") {
    if (!params.groupByFieldId) {
      throw new Error("groupByFieldId is required for custom_field reports");
    }
    const rows = await computeCustomFieldReport({
      scope,
      start,
      end,
      groupByFieldId: params.groupByFieldId,
      filters: params.filters,
    });
    return {
      doc: {
        title: "Custom Field Report",
        subtitle,
        sheets: [
          {
            name: "Custom Field",
            columns: [
              { key: "value", header: "Value" },
              { key: "count", header: "Count" },
            ],
            rows,
          },
        ],
      },
      rowCount: rows.length,
    };
  }

  // cross_department — RPT-06/07: only reachable with cross-department scope.
  if (scope.kind !== "cross_department") {
    throw new Error("Cross-department reports require Project Admin (tenant-admin) scope");
  }
  const buckets = await computeCrossDepartmentReport(scope.tenantId, start, end);
  const rows = buckets.map((b) => ({ departmentName: b.departmentName, category: b.category, count: b.count }));
  return {
    doc: {
      title: "Cross-Department Report",
      subtitle,
      sheets: [
        {
          name: "Cross-Department",
          columns: [
            { key: "departmentName", header: "Department" },
            { key: "category", header: "Category" },
            { key: "count", header: "Count" },
          ],
          rows,
        },
      ],
    },
    rowCount: rows.length,
  };
}
