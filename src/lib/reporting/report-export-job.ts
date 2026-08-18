import "server-only";
import { prisma } from "@/lib/db";
import { runAsSystem } from "@/lib/request-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCsv } from "@/lib/exports/to-csv";
import { buildXlsx } from "@/lib/exports/to-xlsx";
import { buildPdf } from "@/lib/exports/to-pdf";
import { buildReportExportDoc, type ReportType, type ReportRequestParams } from "@/lib/reporting/export-doc";
import type { ReportScope } from "@/lib/reporting/report-scope";
import type { ReportExportFormat } from "@/generated/prisma/enums";

/**
 * RPT-05: exports over the row-count threshold run asynchronously and
 * deliver by download link, mirroring lib/bulk-reassign.ts's job-row +
 * after()-kickoff + cron-sweep pattern (no queue library in this codebase).
 * `params` snapshots both the report request and the caller's resolved
 * ReportScope at creation time, so a retry re-runs with the exact same
 * scope/filters rather than re-resolving them (consistent with
 * BulkReassignJob's "snapshot at creation" approach).
 *
 * Uploads reuse the existing "attachments" storage bucket (already
 * provisioned) under a `report-exports/` prefix, rather than a new
 * dedicated bucket that would need its own provisioning/RLS setup.
 */

type JobParams = { reportParams: ReportRequestParams; scope: ReportScope };

export async function createReportExportJob(params: {
  tenantId: string;
  createdById: string;
  reportType: ReportType;
  format: ReportExportFormat;
  reportParams: ReportRequestParams;
  scope: ReportScope;
}) {
  const jobParams: JobParams = { reportParams: params.reportParams, scope: params.scope };
  return prisma.reportExportJob.create({
    data: {
      tenantId: params.tenantId,
      createdById: params.createdById,
      reportType: params.reportType,
      format: params.format,
      params: jobParams,
    },
  });
}

function extensionAndContentType(format: ReportExportFormat): { ext: string; contentType: string } {
  if (format === "CSV") return { ext: "csv", contentType: "text/csv; charset=utf-8" };
  if (format === "XLSX") {
    return {
      ext: "xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }
  return { ext: "pdf", contentType: "application/pdf" };
}

/** Processes one job: builds the report, renders it, uploads it, records the result. */
export async function runReportExportJob(jobId: string): Promise<void> {
  const job = await prisma.reportExportJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === "COMPLETED") return;

  await prisma.reportExportJob.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: job.startedAt ?? new Date() },
  });

  try {
    const { reportParams, scope } = job.params as unknown as JobParams;
    const { doc, rowCount } = await buildReportExportDoc(job.reportType as ReportType, reportParams, scope);

    let buffer: Buffer;
    if (job.format === "CSV") {
      buffer = Buffer.from(buildCsv(doc), "utf8");
    } else if (job.format === "XLSX") {
      buffer = await buildXlsx(doc);
    } else {
      buffer = await buildPdf(doc);
    }

    const { ext, contentType } = extensionAndContentType(job.format);
    const path = `report-exports/${job.tenantId}/${job.id}.${ext}`;
    const supabase = createAdminClient();
    const { error: uploadError } = await supabase.storage
      .from("attachments")
      .upload(path, buffer, { contentType, upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const { data: { publicUrl } } = supabase.storage.from("attachments").getPublicUrl(path);

    await prisma.reportExportJob.update({
      where: { id: jobId },
      data: { status: "COMPLETED", completedAt: new Date(), resultUrl: publicUrl, rowCount },
    });
  } catch (err) {
    await prisma.reportExportJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        failureReason: err instanceof Error ? err.message : "Unknown error",
      },
    });
  }
}

/** Runs the job under system scope — for the route's `after()` kick-off and the cron sweep. */
export function runReportExportJobAsSystem(jobId: string): Promise<void> {
  return runAsSystem(() => runReportExportJob(jobId));
}

/** Resumes any job whose initial `after()` run never finished. Safe to call repeatedly. */
export async function sweepStuckReportExportJobs(staleAfterMs = 5 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMs);
  const stuck = await prisma.reportExportJob.findMany({
    where: { OR: [{ status: "PENDING" }, { status: "RUNNING", startedAt: { lt: cutoff } }] },
    select: { id: true },
  });
  for (const { id } of stuck) {
    await runReportExportJobAsSystem(id);
  }
  return stuck.length;
}
