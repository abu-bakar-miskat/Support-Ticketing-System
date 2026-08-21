import "server-only";
import { prisma } from "@/lib/db";
import { createReportExportJob, runReportExportJobAsSystem } from "@/lib/reporting/report-export-job";
import type { ReportType } from "@/lib/reporting/export-doc";
import type { ReportScheduleFrequency } from "@/generated/prisma/enums";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Next run instant for a frequency, counted from `from`. */
export function computeNextRun(frequency: ReportScheduleFrequency, from: Date): Date {
  return new Date(from.getTime() + (frequency === "WEEKLY" ? 7 : 1) * DAY_MS);
}

/**
 * RPT-06: materialize every due schedule into a ReportExportJob (same
 * generation + storage as on-demand exports), then advance its `nextRunAt`.
 * Scheduled reports are always tenant-wide (cross-department) — they belong to
 * a Project Admin. Best-effort per schedule: one failure never blocks the rest.
 */
export async function runDueReportSchedules(now: Date = new Date()): Promise<number> {
  const due = await prisma.reportSchedule.findMany({
    where: { enabled: true, nextRunAt: { lte: now } },
  });

  for (const s of due) {
    try {
      const start = new Date(now.getTime() - s.rangeDays * DAY_MS);
      const job = await createReportExportJob({
        tenantId: s.tenantId,
        createdById: s.createdById,
        reportType: s.reportType as ReportType,
        format: s.format,
        reportParams: { start: start.toISOString(), end: now.toISOString() },
        scope: { kind: "cross_department", tenantId: s.tenantId },
      });
      await runReportExportJobAsSystem(job.id);
    } catch (err) {
      console.error(`[scheduled-reports] schedule ${s.id} failed:`, err);
    } finally {
      await prisma.reportSchedule.update({
        where: { id: s.id },
        data: { lastRunAt: now, nextRunAt: computeNextRun(s.frequency, now) },
      });
    }
  }

  return due.length;
}
