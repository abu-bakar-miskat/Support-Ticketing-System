import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/** RPT-05: poll a large-export job's status; once COMPLETED, `resultUrl` is the download link. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const { jobId } = await params;
  const job = await prisma.reportExportJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.createdById !== profile!.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    resultUrl: job.resultUrl,
    rowCount: job.rowCount,
    failureReason: job.failureReason,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  });
}
