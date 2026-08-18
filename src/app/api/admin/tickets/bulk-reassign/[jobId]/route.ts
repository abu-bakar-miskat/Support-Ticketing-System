import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAdminOrManager } from "@/lib/auth"
import { getProfileDeptScope } from "@/lib/dept-scope"

// ASG-05: progress + result summary polling for a bulk-reassignment job.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { profile: caller, error } = await requireAdminOrManager()
  if (error) return error

  const { jobId } = await params
  const job = await prisma.bulkReassignJob.findUnique({ where: { id: jobId } })
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }

  if (caller!.role === "manager") {
    const deptScope = await getProfileDeptScope(caller!)
    if (!deptScope?.allowedDeptIds.includes(job.departmentId)) {
      return NextResponse.json({ error: "Job is outside your scope" }, { status: 403 })
    }
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    total: job.ticketIds.length,
    succeeded: job.succeededTicketIds.length,
    resultSummary: job.resultSummary,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  })
}
